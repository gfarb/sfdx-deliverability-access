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

  it('uses installed Chrome on macOS instead of bundled Chromium', () => {
    const options = getBrowserLaunchOptions('darwin', '');
    expect(options.product).to.equal('chrome');
    expect(options.channel).to.equal('chrome');
    expect(options).not.to.have.property('executablePath');
    expect(options.headless).to.equal(true);
    expect(options.args).to.deep.equal(['--disable-web-security', '--no-sandbox']);
  });

  it('preserves the default browser on other platforms', () => {
    for (const platform of ['linux', 'win32'] as const) {
      const options = getBrowserLaunchOptions(platform, '');
      expect(options).not.to.have.property('channel');
      expect(options).not.to.have.property('executablePath');
      expect(options).not.to.have.property('product');
    }
  });

  it('preserves Puppeteer executable environment aliases and their priority', () => {
    sinon.stub(process, 'platform').value('darwin');
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
    expect(getBrowserLaunchOptions()).not.to.have.property('channel');
  });

  it('gives an explicit executable priority on every platform, including paths with spaces', () => {
    const executablePath = '/Applications/Custom Chrome.app/Contents/MacOS/Custom Chrome';
    for (const platform of ['darwin', 'linux', 'win32'] as const) {
      const options = getBrowserLaunchOptions(platform, executablePath);
      expect(options.executablePath).to.equal(executablePath);
      expect(options).not.to.have.property('channel');
    }
  });

  it('passes the configured executable to Puppeteer and returns its browser', async () => {
    const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    sinon.stub(process, 'env').value({ ...process.env, PUPPETEER_EXECUTABLE_PATH: executablePath });
    const browser = fromStub(stubInterface<puppeteer.Browser>(sinon));
    const launch = sinon.stub(puppeteer, 'launch').resolves(browser);

    expect(await launchBrowser()).to.equal(browser);
    expect(launch.calledOnceWithExactly(getBrowserLaunchOptions())).to.equal(true);
  });

  it('launches the stable Chrome channel by default on macOS', async () => {
    sinon.stub(process, 'platform').value('darwin');
    sinon.stub(process, 'env').value({ ...process.env, PUPPETEER_EXECUTABLE_PATH: '' });
    const browser = fromStub(stubInterface<puppeteer.Browser>(sinon));
    const launch = sinon.stub(puppeteer, 'launch').resolves(browser);

    expect(await launchBrowser()).to.equal(browser);
    expect(launch.calledOnceWithExactly(getBrowserLaunchOptions('darwin', ''))).to.equal(true);
  });

  it('reports the selected browser, runtime and original error without retrying', async () => {
    sinon.stub(process, 'platform').value('darwin');
    sinon.stub(process, 'arch').value('arm64');
    sinon.stub(process, 'env').value({ ...process.env, PUPPETEER_EXECUTABLE_PATH: '' });
    const launch = sinon.stub(puppeteer, 'launch').rejects(new Error('spawn Unknown system error -86'));
    let failure: unknown;
    try {
      await launchBrowser();
    } catch (error) {
      failure = error;
    }

    expect(String(failure)).to.contain('installed Google Chrome');
    expect(String(failure)).to.contain('darwin/arm64');
    expect(String(failure)).to.contain('spawn Unknown system error -86');
    expect(String(failure)).to.contain('PUPPETEER_EXECUTABLE_PATH');
    expect(launch.calledOnce).to.equal(true);
  });

  it('identifies an invalid explicit browser path instead of silently falling back', async () => {
    const executablePath = '/missing/chrome';
    sinon.stub(process, 'env').value({ ...process.env, PUPPETEER_EXECUTABLE_PATH: executablePath });
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

  it('reports a missing system Chrome installation with installation guidance', async () => {
    sinon.stub(process, 'platform').value('darwin');
    sinon.stub(process, 'env').value({ ...process.env, PUPPETEER_EXECUTABLE_PATH: '' });
    const launch = sinon
      .stub(puppeteer, 'launch')
      .rejects(new Error('Could not find Google Chrome executable for channel'));
    let failure: unknown;
    try {
      await launchBrowser();
    } catch (error) {
      failure = error;
    }

    expect(String(failure)).to.contain('installed Google Chrome');
    expect(String(failure)).to.contain('Could not find Google Chrome executable');
    expect(String(failure)).to.contain('Install a Chrome version');
    expect(launch.calledOnce).to.equal(true);
  });

  it('preserves default launch failures on other operating systems', async () => {
    sinon.stub(process, 'platform').value('linux');
    sinon.stub(process, 'env').value({ ...process.env, PUPPETEER_EXECUTABLE_PATH: '' });
    const launch = sinon.stub(puppeteer, 'launch').rejects(new Error('Failed to launch the browser process'));
    let failure: unknown;
    try {
      await launchBrowser();
    } catch (error) {
      failure = error;
    }

    expect(String(failure)).to.contain('Puppeteer default browser');
    expect(String(failure)).to.contain('Failed to launch the browser process');
    expect(String(failure)).not.to.contain('On macOS');
    expect(launch.calledOnce).to.equal(true);
  });
});
