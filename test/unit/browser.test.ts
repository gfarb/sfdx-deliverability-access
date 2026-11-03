import { expect } from 'chai';
import { fromStub, stubInterface } from '@salesforce/ts-sinon';
import { afterEach, describe, it } from 'mocha';
import * as puppeteer from 'puppeteer';
import * as sinon from 'sinon';
import { getBrowserLaunchOptions, launchBrowser } from '../../src/browser';

describe('browser launch', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('lets Puppeteer select its architecture-compatible managed browser on every platform', () => {
    for (const platform of ['darwin', 'linux', 'win32']) {
      for (const arch of ['arm64', 'x64']) {
        sinon.stub(process, 'platform').value(platform);
        sinon.stub(process, 'arch').value(arch);
        const options = getBrowserLaunchOptions('');
        expect(options).not.to.have.property('channel');
        expect(options).not.to.have.property('executablePath');
        expect(options).not.to.have.property('browser');
        expect(options.headless).to.equal(true);
        expect(options.args).to.deep.equal(['--disable-web-security', '--no-sandbox']);
        sinon.restore();
      }
    }
  });

  it('preserves Puppeteer executable environment aliases and their priority', () => {
    const env: NodeJS.ProcessEnv = {
      PUPPETEER_EXECUTABLE_PATH: '/primary/chrome',
    };
    env['npm_config_puppeteer_executable_path'] = '/npm/chrome';
    env['npm_package_config_puppeteer_executable_path'] = '/package/chrome';
    sinon.stub(process, 'env').value(env);

    expect(getBrowserLaunchOptions().executablePath).to.equal('/primary/chrome');
    env.PUPPETEER_EXECUTABLE_PATH = '';
    expect(getBrowserLaunchOptions().executablePath).to.equal('/npm/chrome');
    env['npm_config_puppeteer_executable_path'] = '';
    expect(getBrowserLaunchOptions().executablePath).to.equal('/package/chrome');
  });

  it('passes an explicit executable path with spaces without selecting a channel', () => {
    const executablePath = '/Applications/Custom Chrome.app/Contents/MacOS/Custom Chrome';
    const options = getBrowserLaunchOptions(executablePath);
    expect(options.executablePath).to.equal(executablePath);
    expect(options).not.to.have.property('channel');
  });

  it('passes the configured executable to Puppeteer and returns its browser', async () => {
    const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    sinon.stub(process, 'env').value({ PUPPETEER_EXECUTABLE_PATH: executablePath });
    const browser = fromStub(stubInterface<puppeteer.Browser>(sinon));
    const launch = sinon.stub(puppeteer, 'launch').resolves(browser);

    expect(await launchBrowser()).to.equal(browser);
    expect(launch.calledOnceWithExactly(getBrowserLaunchOptions())).to.equal(true);
  });

  it('launches the managed browser on macOS without requiring installed Chrome', async () => {
    sinon.stub(process, 'platform').value('darwin');
    sinon.stub(process, 'env').value({});
    const browser = fromStub(stubInterface<puppeteer.Browser>(sinon));
    const launch = sinon.stub(puppeteer, 'launch').resolves(browser);

    expect(await launchBrowser()).to.equal(browser);
    expect(launch.calledOnceWithExactly(getBrowserLaunchOptions(''))).to.equal(true);
    expect(launch.firstCall.args[0]).not.to.have.property('channel');
    expect(launch.firstCall.args[0]).not.to.have.property('executablePath');
  });

  it('reports the selected browser, runtime and original error without retrying', async () => {
    sinon.stub(process, 'platform').value('darwin');
    sinon.stub(process, 'arch').value('arm64');
    sinon.stub(process, 'env').value({});
    const launch = sinon.stub(puppeteer, 'launch').rejects(new Error('spawn Unknown system error -86'));
    let failure: unknown;
    try {
      await launchBrowser();
    } catch (error) {
      failure = error;
    }

    expect(String(failure)).to.contain('Puppeteer-managed Chrome');
    expect(String(failure)).to.contain('darwin/arm64');
    expect(String(failure)).to.contain('spawn Unknown system error -86');
    expect(String(failure)).to.contain('PUPPETEER_EXECUTABLE_PATH');
    expect(launch.calledOnce).to.equal(true);
  });

  it('identifies an invalid explicit browser path instead of silently falling back', async () => {
    const executablePath = '/missing/chrome';
    sinon.stub(process, 'env').value({ PUPPETEER_EXECUTABLE_PATH: executablePath });
    const launch = sinon.stub(puppeteer, 'launch').rejects(new Error('ENOENT'));
    let failure: unknown;
    try {
      await launchBrowser();
    } catch (error) {
      failure = error;
    }

    expect(String(failure)).to.contain(executablePath);
    expect(String(failure)).to.contain('ENOENT');
    expect(launch.calledOnce).to.equal(true);
  });

  it('reports a missing managed browser with download guidance', async () => {
    sinon.stub(process, 'platform').value('darwin');
    sinon.stub(process, 'env').value({});
    const launch = sinon.stub(puppeteer, 'launch').rejects(new Error('Could not find Chrome'));
    let failure: unknown;
    try {
      await launchBrowser();
    } catch (error) {
      failure = error;
    }

    expect(String(failure)).to.contain('Puppeteer-managed Chrome');
    expect(String(failure)).to.contain('Could not find Chrome');
    expect(String(failure)).to.contain('Reinstall the plugin with browser downloads enabled');
    expect(launch.calledOnce).to.equal(true);
  });

  it('preserves default launch failures on other operating systems', async () => {
    sinon.stub(process, 'platform').value('linux');
    sinon.stub(process, 'env').value({});
    const launch = sinon.stub(puppeteer, 'launch').rejects(new Error('Failed to launch the browser process'));
    let failure: unknown;
    try {
      await launchBrowser();
    } catch (error) {
      failure = error;
    }

    expect(String(failure)).to.contain('Puppeteer-managed Chrome');
    expect(String(failure)).to.contain('Failed to launch the browser process');
    expect(String(failure)).not.to.contain('On macOS');
    expect(launch.calledOnce).to.equal(true);
  });
});
