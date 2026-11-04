import * as os from 'os';
import * as util from 'util';
import { exec } from 'child_process';
import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError } from '@salesforce/core';
import { ElementHandle, Frame, Page } from 'puppeteer';
import { getErrorMessage, launchBrowser } from '../../browser';
const execPromise = util.promisify(exec);
const setupFrameSelector = '#setupComponent > div.setupcontent > div > div > force-aloha-page > div > iframe';
const accessLevelSelector =
  '#thePage\\:theForm\\:editBlock\\:sendEmailAccessControlSection\\:sendEmailAccessControl\\:sendEmailAccessControlSelect';
const navigationErrorPattern =
  /Execution context was destroyed|Cannot find context with specified id|frame.*detached|detached frame/i;

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
      const accessUrl = await this.parseOrgData(String(this.flags.user));
      if (accessUrl === undefined) return;
      try {
        await this.toggleDeliverability(accessUrl, accessLevelValue);
      } catch (error) {
        this.stopSpinnerAndLogError(error);
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
      return (
        response.result.url.replace('my.salesforce', 'lightning.force') +
        '&retURL=/lightning/setup/OrgEmailSettings/home'
      );
    } catch (error) {
      this.stopSpinnerAndLogError(
        "Unable to parse url from 'sfdx force:org:open' command. Please make sure you have a default org set or you are passing a valid username/alias with the '-u' or '--user' flag."
      );
      return;
    }
  }

  private async toggleDeliverability(accessUrl: string, accessLevelValue: string): Promise<void> {
    this.ux.setSpinnerStatus('Launching headless browser');
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.goto(accessUrl);
      this.ux.setSpinnerStatus('Waiting for page to load');
      const { frame, field } = await this.waitForDeliverabilityField(page);
      this.ux.setSpinnerStatus('Selecting Deliverability Access Level');
      await field.select(accessLevelValue);
      await frame.click('#thePage\\:theForm\\:editBlock\\:buttons\\:saveBtn');
      await frame.waitForSelector('#thePage\\:theForm\\:successText');
    } finally {
      await browser.close();
    }
    this.ux.stopSpinner('🎉 Email Deliverability Access Level has been set!');
  }

  private async waitForDeliverabilityField(page: Page): Promise<{ frame: Frame; field: ElementHandle }> {
    const deadline = Date.now() + 60000;
    let navigationError: unknown;
    while (Date.now() < deadline) {
      const frameTimeout = deadline - Date.now();
      if (frameTimeout <= 0) break;
      try {
        const iframe = await page.waitForSelector(setupFrameSelector, { timeout: frameTimeout });
        const frame = await iframe?.contentFrame();
        const fieldTimeout = deadline - Date.now();
        if (frame && fieldTimeout > 0) {
          const field = await frame.waitForSelector(accessLevelSelector, { timeout: fieldTimeout });
          if (field) return { frame, field };
        }
      } catch (error) {
        const cause = error instanceof Error ? error.cause : undefined;
        if (!navigationErrorPattern.test(`${getErrorMessage(error)} ${getErrorMessage(cause)}`)) throw error;
        navigationError = error;
      }
      // A redirect can invalidate a handle after waitForSelector has resolved.
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      this.ux.setSpinnerStatus('Waiting for setup navigation to finish');
      await new Promise((resolve) => setTimeout(resolve, Math.min(100, remaining)));
    }
    throw new Error('Timed out waiting for the Deliverability setup controls after 60000 ms', {
      cause: navigationError,
    });
  }

  private stopSpinnerAndLogError(error: unknown): never {
    this.ux.stopSpinner('❌ Access Level could not be set.');
    const cause = error instanceof Error ? error : new Error(getErrorMessage(error), { cause: error });
    throw new SfdxError(cause.message, undefined, undefined, undefined, cause);
  }
}
