import { inspect } from 'util';
import puppeteer = require('puppeteer');

type LaunchOptions = NonNullable<Parameters<typeof puppeteer.launch>[0]>;

export function getBrowserLaunchOptions(
  executablePath: string | undefined = process.env.PUPPETEER_EXECUTABLE_PATH
): LaunchOptions {
  const options: LaunchOptions = {
    headless: true,
    args: ['--disable-web-security', '--no-sandbox'],
  };

  if (executablePath) {
    options.executablePath = executablePath;
  }

  return options;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : inspect(error, { customInspect: false, getters: false });
}

export async function launchBrowser(): Promise<puppeteer.Browser> {
  const options = getBrowserLaunchOptions();
  try {
    return await puppeteer.launch(options);
  } catch (error) {
    const browser = options.executablePath ? `browser at "${options.executablePath}"` : 'Puppeteer-managed Chrome';
    const message = getErrorMessage(error);
    const systemError: NodeJS.ErrnoException | undefined = error instanceof Error ? error : undefined;
    const macHint =
      process.platform === 'darwin' &&
      (systemError?.errno === -86 || /\b(?:error|errno)\s*[:=]?\s*-86\b/i.test(message))
        ? ' On macOS, spawn error -86 means the executable has an incompatible CPU type.'
        : '';
    throw new Error(
      `Unable to launch ${browser} on ${process.platform}/${process.arch}: ${message}. ` +
        'Reinstall the plugin with browser downloads enabled, or set ' +
        'PUPPETEER_EXECUTABLE_PATH to a compatible Chrome/Chromium executable.' +
        macHint,
      { cause: error }
    );
  }
}
