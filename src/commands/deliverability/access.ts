import * as os from 'os';
import * as util from 'util';
import { exec } from 'child_process';
import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError } from '@salesforce/core';
import webdriver = require('selenium-webdriver');
import chrome = require('selenium-webdriver/chrome');
import until = require('selenium-webdriver/lib/until');
import chromedriver = require('chromedriver');
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
    const childElementIndex = String(accessValuesMap.get(accessLevel?.toLowerCase()));
    if (childElementIndex !== 'undefined' && Number(childElementIndex) > -1 && Number(childElementIndex) < 3) {
      const accessUrl: string = await this.parseOrgData(String(this.flags.user));
      void this.toggleDeliverability(accessUrl, childElementIndex);
    } else {
      this.ux.stopSpinner('❌ Access Level could not be set.');
      throw new SfdxError(`${accessLevel} is not a valid value for the Level flag.`, 'Invalid value for Level flag');
    }
  }

  private async parseOrgData(user: string): Promise<string> {
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
      this.ux.stopSpinner('❌ Access Level could not be set.');
      const errorMessage = `Unable to parse url from 'sfdx force:org:open' command. Please make sure you have a default org set or you are passing a valid username/alias with the '-u' or '--user' flag.\n\n${String(
        error
      )}`;
      throw new SfdxError(errorMessage);
    }
  }

  private async toggleDeliverability(accessUrl: string, childElementIndex: string): Promise<void> {
    let driver;
    try {
      const service = new chrome.ServiceBuilder(String(chromedriver.path)).build();
      chrome.setDefaultService(service);
      const options = new chrome.Options()
        .addArguments('--no-sandbox')
        .addArguments('--disable-dev-shm-usage')
        .addArguments('--headless');
      driver = await new webdriver.Builder().forBrowser('chrome').setChromeOptions(options).build();
    } catch (error) {
      if (String(error).includes('version of ChromeDriver only supports Chrome version')) {
        this.ux.stopSpinner('❌ Access Level could not be set.');
        throw new SfdxError(String(error), ' Please make sure you have the correct Chromedriver version installed.');
      }
    }
    if (driver === undefined) return;
    try {
      await driver.manage().setTimeouts({ implicit: 30000, pageLoad: 30000, script: 30000 });
      await driver.get(accessUrl);
      await driver.wait(until.titleIs('Deliverability | Salesforce'), 30000);
      await driver.sleep(3000);
      await driver.switchTo().frame(0);
      await driver.executeScript(
        `document.getElementsByClassName('pbSubsection')[0].children[0].children[0].children[0].children[0].children[0].children[${childElementIndex}].selected=true`
      );
      await driver.findElement(webdriver.By.id('thePage:theForm:editBlock:buttons:saveBtn')).click();
      await driver.sleep(1000);
      this.ux.stopSpinner('🎉 Email Deliverability Access Level has been set!');
    } catch (error) {
      this.ux.stopSpinner('❌ Access Level could not be set.');
      this.ux.log(`The following error occurred:\n${String(error)}`);
    } finally {
      await driver.quit();
    }
  }
}
