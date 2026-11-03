import puppeteer = require('puppeteer');

type LaunchOptions = NonNullable<Parameters<typeof puppeteer.launch>[0]>;

export function getBrowserLaunchOptions(
  platform: NodeJS.Platform = process.platform,
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
  } else if (platform === 'darwin') {
    // Puppeteer 18 defaults to Intel Chromium on macOS, even on Apple Silicon.
    options.product = 'chrome';
    options.channel = 'chrome';
  }

  return options;
}

export async function launchBrowser(): Promise<puppeteer.Browser> {
  const options = getBrowserLaunchOptions();
  try {
    return await puppeteer.launch(options);
  } catch (error) {
    const browser = options.executablePath
      ? `browser at "${options.executablePath}"`
      : options.channel
      ? 'installed Google Chrome (stable channel)'
      : 'Puppeteer default browser';
    const macHint =
      process.platform === 'darwin'
        ? ' On macOS, spawn error -86 means the executable has an incompatible CPU type.'
        : '';
    throw new Error(
      `Unable to launch ${browser} on ${process.platform}/${process.arch}: ${String(error)}. ` +
        'Install a Chrome version compatible with your operating system and CPU, or set ' +
        'PUPPETEER_EXECUTABLE_PATH to a compatible Chrome/Chromium executable.' +
        macHint
    );
  }
}
