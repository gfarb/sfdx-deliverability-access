import * as os from 'os';
import * as util from 'util';
import { exec } from 'child_process';
import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError } from '@salesforce/core';
import puppeteer = require('puppeteer');
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
        void this.toggleDeliverability(accessUrl, accessLevelValue);
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
          ? `sfdx force:org:open -r --json -u ${user}`
          : 'sfdx force:org:open -r --json';
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
    let browser;
    let error;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--disable-web-security', '--no-sandbox'],
      });
      const page = await browser.newPage();
      await page.goto(accessUrl);
      const frame = await page.waitForSelector(
        '#setupComponent > div.setupcontent > div > div > force-aloha-page > div > iframe'
      );
      const contentFrame = await frame?.contentFrame();
      const accessLevelField = await contentFrame?.waitForSelector(
        '#thePage\\:theForm\\:editBlock\\:sendEmailAccessControlSection\\:sendEmailAccessControl\\:sendEmailAccessControlSelect'
      );
      await accessLevelField?.select(accessLevelValue);
      await contentFrame?.click('#thePage\\:theForm\\:editBlock\\:buttons\\:saveBtn');
      await contentFrame?.waitForSelector('#thePage\\:theForm\\:successText');
    } catch (err) {
      error = String(err);
    } finally {
      await browser?.close();
      if (error !== undefined) {
        this.stopSpinnerAndLogError(error);
      } else {
        this.ux.stopSpinner('🎉 Email Deliverability Access Level has been set!');
      }
    }
  }

  private stopSpinnerAndLogError(errorMessage: string): void {
    this.ux.stopSpinner('❌ Access Level could not be set.');
    throw new SfdxError(errorMessage);
  }
}
