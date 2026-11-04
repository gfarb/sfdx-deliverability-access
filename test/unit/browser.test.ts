import { expect } from 'chai';
import { fromStub, stubInterface } from '@salesforce/ts-sinon';
import { afterEach, beforeEach, describe, it } from 'mocha';
import * as puppeteer from 'puppeteer';
import * as sinon from 'sinon';
import { getBrowserLaunchOptions, launchBrowser } from '../../src/browser';

describe('browser launch', () => {
  let launch: sinon.SinonStub<Parameters<typeof puppeteer.launch>, ReturnType<typeof puppeteer.launch>>;
  let platform: sinon.SinonStub;
  let arch: sinon.SinonStub;

  beforeEach(() => {
    launch = sinon.stub(puppeteer, 'launch');
    platform = sinon.stub(process, 'platform').value('darwin');
    arch = sinon.stub(process, 'arch').value('arm64');
    sinon.stub(process, 'env').value({});
  });

  afterEach(() => {
    sinon.restore();
  });

  async function failedLaunch(): Promise<Error> {
    try {
      await launchBrowser();
    } catch (error) {
      if (error instanceof Error) return error;
      throw error;
    }
    throw new Error('Expected browser launch to fail');
  }

  it('lets Puppeteer select its architecture-compatible managed browser on every platform', () => {
    for (const os of ['darwin', 'linux', 'win32']) {
      for (const cpu of ['arm64', 'x64']) {
        platform.value(os);
        arch.value(cpu);
        const options = getBrowserLaunchOptions('');
        expect(options).not.to.have.property('channel');
        expect(options).not.to.have.property('executablePath');
        expect(options).not.to.have.property('browser');
        expect(options.headless).to.equal(true);
        expect(options.args).to.deep.equal(['--disable-web-security', '--no-sandbox']);
      }
    }
  });

  it('uses the standard executable override and ignores both removed npm aliases', () => {
    const env: NodeJS.ProcessEnv = {
      PUPPETEER_EXECUTABLE_PATH: '/primary/chrome',
    };
    env['npm_config_puppeteer_executable_path'] = '/npm/chrome';
    env['npm_package_config_puppeteer_executable_path'] = '/package/chrome';
    Object.assign(process.env, env);

    expect(getBrowserLaunchOptions().executablePath).to.equal('/primary/chrome');
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    expect(getBrowserLaunchOptions()).not.to.have.property('executablePath');
    delete process.env['npm_config_puppeteer_executable_path'];
    expect(getBrowserLaunchOptions()).not.to.have.property('executablePath');
  });

  it('passes an explicit executable path with spaces without selecting a channel', () => {
    const executablePath = '/Applications/Custom Chrome.app/Contents/MacOS/Custom Chrome';
    const options = getBrowserLaunchOptions(executablePath);
    expect(options.executablePath).to.equal(executablePath);
    expect(options).not.to.have.property('channel');
  });

  it('passes the configured executable to Puppeteer and returns its browser', async () => {
    const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    process.env.PUPPETEER_EXECUTABLE_PATH = executablePath;
    const browser = fromStub(stubInterface<puppeteer.Browser>(sinon));
    launch.resolves(browser);

    expect(await launchBrowser()).to.equal(browser);
    expect(launch.calledOnceWithExactly(getBrowserLaunchOptions())).to.equal(true);
  });

  it('launches the managed browser on macOS without requiring installed Chrome', async () => {
    const browser = fromStub(stubInterface<puppeteer.Browser>(sinon));
    launch.resolves(browser);

    expect(await launchBrowser()).to.equal(browser);
    expect(launch.calledOnceWithExactly(getBrowserLaunchOptions(''))).to.equal(true);
    expect(launch.firstCall.args[0]).not.to.have.property('channel');
    expect(launch.firstCall.args[0]).not.to.have.property('executablePath');
  });

  const missingPath = '/missing/Chrome -86.app/Contents/MacOS/Chrome';
  const launchFailures: Array<{
    name: string;
    error: Error;
    cpuHint: boolean;
    os?: NodeJS.Platform;
    executablePath?: string;
  }> = [
    { name: 'macOS CPU mismatch', error: new Error('spawn Unknown system error -86'), cpuHint: true },
    { name: 'missing managed browser', error: new Error('Could not find Chrome'), cpuHint: false },
    {
      name: 'invalid explicit path containing -86',
      error: new Error(`ENOENT: browser not found at ${missingPath}`),
      executablePath: missingPath,
      cpuHint: false,
    },
    { name: 'non-macOS failure', error: new Error('spawn Unknown system error -86'), os: 'linux', cpuHint: false },
    { name: 'macOS errno -86', error: Object.assign(new Error('spawn failed'), { errno: -86 }), cpuHint: true },
    { name: 'different error code', error: new Error('spawn Unknown system error -860'), cpuHint: false },
  ];
  for (const { name, error, cpuHint, os = 'darwin', executablePath } of launchFailures) {
    it(`reports ${name} with its cause and guidance, without falling back`, async () => {
      platform.value(os);
      process.env.PUPPETEER_EXECUTABLE_PATH = executablePath;
      launch.rejects(error);
      const failure = await failedLaunch();
      expect(failure.message).to.contain(executablePath || 'Puppeteer-managed Chrome');
      expect(failure.message).to.contain(`${os}/arm64: ${error.message}`);
      expect(failure.message).to.contain('PUPPETEER_EXECUTABLE_PATH');
      expect(failure.message).to.contain('Reinstall the plugin with browser downloads enabled');
      expect(failure.message).not.to.contain('Error:');
      expect(failure.message.includes('incompatible CPU type')).to.equal(cpuHint);
      expect(failure.cause).to.equal(error);
      expect(launch.calledOnce).to.equal(true);
    });
  }

  it('handles non-Error throws without losing the original cause', async () => {
    const failures: Array<{ value: unknown; message: string }> = [
      { value: 'browser missing', message: 'browser missing' },
      { value: null, message: 'null' },
      { value: undefined, message: 'undefined' },
      { value: 42, message: '42' },
      { value: { reason: 'permission denied' }, message: "{ reason: 'permission denied' }" },
      { value: { toString: undefined }, message: '{ toString: undefined }' },
    ];
    for (const { value, message } of failures) {
      launch.callsFake(() => Promise.reject(value));
      const failure = await failedLaunch();
      expect(failure.message).to.contain(message);
      expect(failure.cause).to.equal(value);
    }
    expect(launch.callCount).to.equal(failures.length);
  });
});
