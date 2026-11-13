import { IConfig } from '@oclif/config';
import { fromStub, stubInterface, stubMethod, StubbedType } from '@salesforce/ts-sinon';
import { UX } from '@salesforce/command/lib/ux';
import { SfdxError } from '@salesforce/core';
import { expect } from 'chai';
import { afterEach, beforeEach, describe, it } from 'mocha';
import { Browser, ElementHandle, Frame, Page } from 'puppeteer';
import * as sinon from 'sinon';
import Access from '../../src/commands/deliverability/access';
import * as browserLauncher from '../../src/browser';

class TestAccess extends Access {
  public constructor(config: IConfig, ux: UX) {
    super([], config);
    this.flags = { level: 'none', user: 'test-org' };
    this.ux = ux;
  }
}

describe('deliverability access', () => {
  let command: TestAccess;
  let browser: StubbedType<Browser>;
  let page: StubbedType<Page>;
  let iframe: StubbedType<ElementHandle<HTMLIFrameElement>>;
  let frame: StubbedType<Frame>;
  let field: StubbedType<ElementHandle<HTMLSelectElement>>;
  let ux: StubbedType<UX>;
  let launch: sinon.SinonStub<[], Promise<Browser>>;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    const config = fromStub(stubInterface<IConfig>(sinon, { bin: 'sfdx' }));
    ux = stubInterface<UX>(sinon);
    command = new TestAccess(config, fromStub(ux));
    browser = stubInterface<Browser>(sinon);
    page = stubInterface<Page>(sinon);
    iframe = stubInterface<ElementHandle<HTMLIFrameElement>>(sinon);
    frame = stubInterface<Frame>(sinon);
    field = stubInterface<ElementHandle<HTMLSelectElement>>(sinon);
    stubMethod(sinon, command, 'parseOrgData').resolves('https://example.invalid/setup');
    launch = sinon.stub(browserLauncher, 'launchBrowser').resolves(fromStub(browser));
    browser.newPage.resolves(fromStub(page));
    page.waitForSelector.resolves(fromStub(iframe));
    iframe.contentFrame.resolves(fromStub(frame));
    frame.waitForSelector.resolves(fromStub(field));
    clock = sinon.useFakeTimers({ now: 0, toFake: ['Date', 'setTimeout'] });
  });

  afterEach(() => {
    sinon.restore();
  });

  async function failedRun(): Promise<SfdxError> {
    try {
      await command.run();
    } catch (error) {
      if (error instanceof SfdxError) return error;
      throw error;
    }
    throw new Error('Expected command to fail');
  }

  it('uses plain navigation and waits for delayed controls before selecting and saving', async () => {
    const navigation = sinon.promise<null>();
    const readiness = sinon.promise<ElementHandle<HTMLSelectElement>>();
    page.goto.returns(navigation);
    frame.waitForSelector.onFirstCall().returns(readiness);

    const run = command.run();
    await new Promise((resolve) => setImmediate(resolve));
    expect(page.goto.calledOnceWithExactly('https://example.invalid/setup')).to.equal(true);
    expect(page.waitForSelector.called).to.equal(false);
    await navigation.resolve(null);
    await new Promise((resolve) => setImmediate(resolve));
    expect(frame.waitForSelector.calledOnce).to.equal(true);
    expect(field.select.called).to.equal(false);
    expect(frame.click.called).to.equal(false);
    await readiness.resolve(fromStub(field));
    await run;

    expect(field.select.calledOnceWithExactly('0')).to.equal(true);
    expect(frame.click.calledOnceWithExactly('#thePage\\:theForm\\:editBlock\\:buttons\\:saveBtn')).to.equal(true);
    expect(frame.waitForSelector.calledWithExactly('#thePage\\:theForm\\:successText')).to.equal(true);
    expect(browser.close.calledOnce).to.equal(true);
  });

  for (const stage of ['navigation', 'readiness', 'selection'] as const) {
    it(`reports ${stage} failures once without saving and closes the browser`, async () => {
      const original = new Error(`${stage} failed`);
      const operation = { navigation: page.goto, readiness: page.waitForSelector, selection: field.select }[stage];
      operation.rejects(original);
      const failure = await failedRun();
      expect(failure.message).to.equal(original.message);
      expect(failure.cause).to.equal(original);
      expect(operation.calledOnce).to.equal(true);
      expect(ux.stopSpinner.calledOnce).to.equal(true);
      expect(field.select.callCount).to.equal(stage === 'selection' ? 1 : 0);
      expect(frame.click.called).to.equal(false);
      expect(browser.close.calledOnce).to.equal(true);
    });
  }

  it('reacquires the iframe after wrapped context and detached-frame failures during redirects', async () => {
    const oldFrame = stubInterface<Frame>(sinon);
    page.waitForSelector.onFirstCall().rejects(
      new Error('Waiting for selector failed', {
        cause: new Error('Protocol error (DOM.describeNode): Cannot find context with specified id'),
      })
    );
    iframe.contentFrame.onFirstCall().resolves(fromStub(oldFrame));
    oldFrame.waitForSelector.rejects(new Error('Waiting failed: Frame detached'));

    const run = command.run();
    await clock.tickAsync(200);
    await run;

    expect(page.waitForSelector.callCount).to.equal(3);
    expect(iframe.contentFrame.callCount).to.equal(2);
    expect(oldFrame.waitForSelector.calledOnce).to.equal(true);
    expect(page.waitForSelector.getCall(0).args[1]).to.deep.equal({ timeout: 60000 });
    expect(page.waitForSelector.getCall(1).args[1]).to.deep.equal({ timeout: 59900 });
    expect(frame.waitForSelector.firstCall.args[1]).to.deep.equal({ timeout: 59800 });
    expect(field.select.calledOnceWithExactly('0')).to.equal(true);
    expect(browser.close.calledOnce).to.equal(true);
  });

  it('waits for a content frame that is not attached yet instead of skipping the setting', async () => {
    iframe.contentFrame.onFirstCall().resolves(null);
    const run = command.run();
    await clock.tickAsync(100);
    await run;
    expect(page.waitForSelector.callCount).to.equal(2);
    expect(field.select.calledOnceWithExactly('0')).to.equal(true);
    expect(browser.close.calledOnce).to.equal(true);
  });

  it('shares the readiness deadline between the outer iframe and inner controls', async () => {
    iframe.contentFrame.callsFake(() => {
      clock.setSystemTime(15000);
      return Promise.resolve(fromStub(frame));
    });
    await command.run();
    expect(frame.waitForSelector.firstCall.args[1]).to.deep.equal({ timeout: 45000 });
  });

  it('bounds repeated navigation failures to the original deadline and closes without saving', async () => {
    const original = new Error('Execution context was destroyed');
    page.waitForSelector.onFirstCall().rejects(original);
    page.waitForSelector.onSecondCall().callsFake(() => {
      clock.setSystemTime(60000);
      return Promise.reject(original);
    });
    const result = failedRun();
    await clock.tickAsync(100);
    const failure = await result;
    expect(failure.message).to.equal('Timed out waiting for the Deliverability setup controls after 60000 ms');
    expect(failure.cause?.cause).to.equal(original);
    expect(page.waitForSelector.callCount).to.equal(2);
    expect(page.waitForSelector.secondCall.args[1]).to.deep.equal({ timeout: 59900 });
    expect(field.select.called).to.equal(false);
    expect(frame.click.called).to.equal(false);
    expect(browser.close.calledOnce).to.equal(true);
  });

  it('does not pass a zero timeout when frame acquisition exhausts the readiness budget', async () => {
    iframe.contentFrame.callsFake(() => {
      clock.setSystemTime(60000);
      return Promise.resolve(fromStub(frame));
    });
    const failure = await failedRun();
    expect(failure.message).to.contain('after 60000 ms');
    expect(frame.waitForSelector.called).to.equal(false);
    expect(field.select.called).to.equal(false);
    expect(browser.close.calledOnce).to.equal(true);
  });

  it('retains a launch diagnostic and its cause without adding nested Error prefixes', async () => {
    const spawnError = new Error('spawn Unknown system error -86');
    const original = new Error('Unable to launch Puppeteer-managed Chrome: spawn Unknown system error -86', {
      cause: spawnError,
    });
    launch.rejects(original);
    const failure = await failedRun();
    expect(failure.message).to.equal(original.message);
    expect(failure.message).not.to.contain('Error:');
    expect(failure.cause).to.equal(original);
    expect(failure.cause?.cause).to.equal(spawnError);
    expect(browser.close.called).to.equal(false);
    expect(ux.stopSpinner.calledOnce).to.equal(true);
  });

  it('normalizes non-Error failures without losing their value', async () => {
    page.goto.callsFake(() => Promise.reject('Redirect failed'));
    const failure = await failedRun();
    expect(failure.message).to.equal('Redirect failed');
    expect(failure.cause?.cause).to.equal('Redirect failed');
    expect(browser.close.calledOnce).to.equal(true);
  });
});
