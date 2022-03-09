import * as os from 'os';
import { exec } from 'child_process';
import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError } from '@salesforce/core';
import webdriver = require('selenium-webdriver');
import chrome = require('selenium-webdriver/chrome');
import until = require('selenium-webdriver/lib/until');
require('chromedriver');

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

  public static args = [{ name: 'file' }];

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
    const childElementIndex = String(accessValuesMap.get(accessLevel.toLowerCase()));
    if (Number(childElementIndex) > -1 && Number(childElementIndex) < 3) {
      const accessUrl: string = await this.parseOrgData(String(this.flags.user));
      void this.toggleDeliverability(accessUrl, childElementIndex);
    } else {
      this.ux.stopSpinner('Access Level could not be set');
      throw new SfdxError(`${accessLevel} is not a valid value for the Level flag.`, 'Invalid value for Level flag');
    }
  }

  private parseOrgData(user: string): Promise<string> {
    return new Promise((resolve) => {
      const orgDataCommand =
        user !== undefined && user?.length > 0
          ? `sfdx force:org:open -r --json -u ${user}`
          : 'sfdx force:org:open -r --json';
      exec(orgDataCommand, (error, stdout, stderr) => {
        if (error) {
          this.ux.stopSpinner('Access Level could not be set');
          throw new SfdxError(error.message, error.name);
        }
        if (stderr) {
          this.ux.stopSpinner('Access Level could not be set');
          throw new SfdxError(stderr, 'sfdx force:org:open');
        }
        if (stdout) {
          const response = JSON.parse(stdout) as JsonResponse;
          resolve(
            response.result.url.replace('my.salesforce', 'lightning.force') +
              '&retURL=/lightning/setup/OrgEmailSettings/home'
          );
        }
      });
    });
  }

  private async toggleDeliverability(accessUrl: string, childElementIndex: string): Promise<void> {
    const options = new chrome.Options()
      .addArguments('--no-sandbox')
      .addArguments('--disable-dev-shm-usage')
      .addArguments('--headless');
    const driver = await new webdriver.Builder().forBrowser('chrome').setChromeOptions(options).build();
    try {
      await driver.manage().setTimeouts({ implicit: 30000, pageLoad: 30000, script: 30000 });
      await driver.get(accessUrl);
      await driver.wait(until.titleIs('Deliverability | Salesforce'), 30000);
      await driver.sleep(3000);
      await driver.switchTo().frame(0);
      const scriptToSetAccessLevel = `document.getElementsByClassName('pbSubsection')[0].children[0].children[0].children[0].children[0].children[0].children[${childElementIndex}].selected=true`;
      await driver.executeScript(scriptToSetAccessLevel);
      await driver.findElement(webdriver.By.id('thePage:theForm:editBlock:buttons:saveBtn')).click();
      await driver.sleep(1000);
      this.ux.stopSpinner('Email Deliverability Access Level has been set!');
    } catch (error) {
      this.ux.stopSpinner('Access Level could not be set');
      this.ux.log(`The following error occurred:\n${String(error)}`);
    } finally {
      await driver.quit();
    }
  }
}
