import { IConfig } from '@oclif/config';
import { fromStub, stubInterface, stubMethod, StubbedType } from '@salesforce/ts-sinon';
import { UX } from '@salesforce/command/lib/ux';
import { expect } from 'chai';
import { afterEach, describe, it } from 'mocha';
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
  afterEach(() => {
    sinon.restore();
  });

  function setup(): {
    command: TestAccess;
    browser: StubbedType<Browser>;
    page: StubbedType<Page>;
    frame: StubbedType<Frame>;
    field: StubbedType<ElementHandle<HTMLSelectElement>>;
  } {
    const config = fromStub(stubInterface<IConfig>(sinon, { bin: 'sfdx' }));
    const ux = stubInterface<UX>(sinon);
    const command = new TestAccess(config, fromStub(ux));
    const browser = stubInterface<Browser>(sinon);
    const page = stubInterface<Page>(sinon);
    const iframe = stubInterface<ElementHandle<HTMLIFrameElement>>(sinon);
    const frame = stubInterface<Frame>(sinon);
    const field = stubInterface<ElementHandle<HTMLSelectElement>>(sinon);
    stubMethod(sinon, command, 'parseOrgData').resolves('https://example.invalid/setup');
    sinon.stub(browserLauncher, 'launchBrowser').resolves(fromStub(browser));
    browser.newPage.resolves(fromStub(page));
    page.waitForSelector.resolves(fromStub(iframe));
    iframe.contentFrame.resolves(fromStub(frame));
    frame.waitForSelector.resolves(fromStub(field));
    return { command, browser, page, frame, field };
  }

  it('waits for login redirects before selecting, saving and closing the browser', async () => {
    const { command, browser, page, frame, field } = setup();
    let finishNavigation: ((value: null) => void) | undefined;
    page.goto.returns(
      new Promise<null>((resolve) => {
        finishNavigation = resolve;
      })
    );

    const run = command.run();
    await new Promise((resolve) => setImmediate(resolve));
    expect(page.goto.calledOnceWithExactly('https://example.invalid/setup', { waitUntil: 'networkidle2' })).to.equal(
      true
    );
    expect(page.waitForSelector.called).to.equal(false);
    if (!finishNavigation) throw new Error('Navigation was not started');
    finishNavigation(null);
    await run;

    expect(field.select.calledOnceWithExactly('0')).to.equal(true);
    expect(frame.click.calledOnceWithExactly('#thePage\\:theForm\\:editBlock\\:buttons\\:saveBtn')).to.equal(true);
    expect(frame.waitForSelector.calledWithExactly('#thePage\\:theForm\\:successText')).to.equal(true);
    expect(browser.close.calledOnce).to.equal(true);
  });

  it('reports a navigation failure without saving and still closes the browser', async () => {
    const { command, browser, page, frame, field } = setup();
    page.goto.rejects(new Error('Navigation failed'));
    let failure: unknown;
    try {
      await command.run();
    } catch (error) {
      failure = error;
    }

    expect(String(failure)).to.contain('Navigation failed');
    expect(field.select.called).to.equal(false);
    expect(frame.click.called).to.equal(false);
    expect(browser.close.calledOnce).to.equal(true);
  });
});
