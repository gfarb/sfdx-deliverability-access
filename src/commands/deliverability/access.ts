import * as os from 'os';
import * as util from 'util';
import { exec } from 'child_process';
import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError } from '@salesforce/core';
import puppeteer from 'puppeteer';

const execPromise = util.promisify(exec);

const accessValuesMap = new Map<string, string>([
  ['none', '0'],
  ['n', '0'],
  ['0', '0'],
  ['system', '1'],
  ['s', '1'],
  ['1', '1'],
  ['all', '2'],
  ['a', '2'],
  ['2', '2'],
]);

Messages.importMessagesDirectory(__dirname);

const messages = Messages.loadMessages('sfdx-deliverability-access', 'org');

export interface JsonResponse {
  status: number;
  result: Result;
}
export interface Result {
  orgId: string;
  url: string;
  username: string;
}

// CSS-escaped IDs for Salesforce Visualforce elements
const SELECTORS = {
  iframe:
    '#setupComponent > div.setupcontent > div > div > force-aloha-page > div > iframe',
  accessLevelSelect:
    '#thePage\\:theForm\\:editBlock\\:sendEmailAccessControlSection\\:sendEmailAccessControl\\:sendEmailAccessControlSelect',
  substituteEmailCheckbox:
    '#thePage\\:theForm\\:editBlock\\:domainAuthSection\\:substituteEmailDomain\\:cbSubstituteEmailDomain',
  saveButton:
    '#thePage\\:theForm\\:editBlock\\:buttons\\:saveBtn',
  successText:
    '#thePage\\:theForm\\:successText',
};

export default class Access extends SfdxCommand {
  public static description = messages.getMessage('commandDescription');

  public static examples = messages.getMessage('examples').split(os.EOL);

  protected static flagsConfig = {
    level: flags.string({
      char: 'l',
      description: messages.getMessage('levelFlagDescription'),
    }),
    user: flags.string({
      char: 'u',
      description: messages.getMessage('userFlagDescription'),
    }),
  };

  protected static requiresProject = false;

  public async run(): Promise<void> {
    this.ux.startSpinner('Attempting to set Email Deliverability Access Level');
    const accessLevel = this.flags.level as string;
    const accessLevelValue = String(accessValuesMap.get(accessLevel?.toLowerCase()));

    if (accessLevelValue !== 'undefined' && Number(accessLevelValue) > -1 && Number(accessLevelValue) < 3) {
      const authUrl = await this.parseOrgData(String(this.flags.user));
      if (authUrl === undefined) return;
      try {
        await this.toggleDeliverability(authUrl, accessLevelValue);
      } catch (error) {
        this.stopSpinnerAndLogError(String(error));
      }
    } else {
      this.stopSpinnerAndLogError(String(`${accessLevel} is not a valid value for the Level flag.`));
    }
  }

  private async parseOrgData(user: string): Promise<string | void> {
    try {
      const orgDataCommand =
        user !== 'undefined' && user?.length > 0
          ? `npx sfdx force:org:open -r --json -u ${user}`
          : 'npx sfdx force:org:open -r --json';
      const orgData = await execPromise(orgDataCommand);
      const response = JSON.parse(orgData.stdout) as JsonResponse;
      // Return the raw auth URL — we'll navigate to the settings page
      // after the session is established in the browser
      return response.result.url;
    } catch (error) {
      this.stopSpinnerAndLogError(
        "Unable to parse url from 'sfdx force:org:open' command. Please make sure you have a default org set or you are passing a valid username/alias with the '-u' or '--user' flag."
      );
      return;
    }
  }

  private async toggleDeliverability(authUrl: string, accessLevelValue: string): Promise<void> {
    let browser;
    let error;
    this.ux.setSpinnerStatus('Launching headless browser');

    try {
      browser = await puppeteer.launch({
        headless: 'shell',
        args: ['--disable-web-security', '--no-sandbox'],
      });

      const page = await browser.newPage();

      // Step 1: Navigate to the auth URL to establish the Salesforce session.
      // The frontdoor.jsp URL logs us in and redirects to the org.
      this.ux.setSpinnerStatus('Authenticating with org');
      await page.goto(authUrl, { waitUntil: 'networkidle2' });

      // Step 2: Now that the session cookie is set, navigate directly to
      // the Email Deliverability settings page on the authenticated domain.
      const currentUrl = new URL(page.url());
      const settingsUrl = `${currentUrl.protocol}//${currentUrl.host}/lightning/setup/OrgEmailSettings/home`;
      this.ux.setSpinnerStatus('Navigating to Email Deliverability settings');
      await page.goto(settingsUrl, { waitUntil: 'networkidle2' });

      // Step 3: The settings are rendered inside a legacy Visualforce iframe.
      this.ux.setSpinnerStatus('Waiting for settings page to load');
      const frameHandle = await page.waitForSelector(SELECTORS.iframe, { timeout: 30000 });
      const contentFrame = await frameHandle?.contentFrame();

      if (!contentFrame) {
        throw new Error('Could not access the settings iframe. The page structure may have changed.');
      }

      // Step 4: Set the Access Level dropdown.
      this.ux.setSpinnerStatus('Selecting Deliverability Access Level');
      const accessLevelField = await contentFrame.waitForSelector(SELECTORS.accessLevelSelect, { timeout: 15000 });
      await accessLevelField?.select(accessLevelValue);

      // Step 5: Ensure "Use a substitute email address for unverified domains" is checked.
      this.ux.setSpinnerStatus('Enabling substitute email address for unverified domains');
      const checkbox = await contentFrame.waitForSelector(SELECTORS.substituteEmailCheckbox, { timeout: 15000 });
      const isChecked = await checkbox?.evaluate((el) => (el as HTMLInputElement).checked);
      if (!isChecked) {
        await checkbox?.click();
      }

      // Step 6: Save the form and wait for the success confirmation.
      this.ux.setSpinnerStatus('Saving settings');
      await contentFrame.click(SELECTORS.saveButton);
      await contentFrame.waitForSelector(SELECTORS.successText, { timeout: 15000 });

    } catch (err) {
      error = String(err);
    } finally {
      await browser?.close();
      if (error !== undefined) {
        this.stopSpinnerAndLogError(error);
      } else {
        this.ux.stopSpinner('🎉 Email Deliverability settings have been updated!');
      }
    }
  }

  private stopSpinnerAndLogError(errorMessage: string): void {
    this.ux.stopSpinner('❌ Settings could not be updated.');
    throw new SfdxError(errorMessage);
  }
}
