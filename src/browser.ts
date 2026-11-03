import puppeteer = require('puppeteer');

type LaunchOptions = NonNullable<Parameters<typeof puppeteer.launch>[0]>;

export function getBrowserLaunchOptions(
  executablePath: string | undefined = process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.npm_config_puppeteer_executable_path ||
    process.env.npm_package_config_puppeteer_executable_path
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

export async function launchBrowser(): Promise<puppeteer.Browser> {
  const options = getBrowserLaunchOptions();
  try {
    return await puppeteer.launch(options);
  } catch (error) {
    const browser = options.executablePath ? `browser at "${options.executablePath}"` : 'Puppeteer-managed Chrome';
    const macHint =
      process.platform === 'darwin'
        ? ' On macOS, spawn error -86 means the executable has an incompatible CPU type.'
        : '';
    throw new Error(
      `Unable to launch ${browser} on ${process.platform}/${process.arch}: ${String(error)}. ` +
        'Reinstall the plugin with browser downloads enabled, or set ' +
        'PUPPETEER_EXECUTABLE_PATH to a compatible Chrome/Chromium executable.' +
        macHint
    );
  }
}
