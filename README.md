# sfdx-deliverability-access

## `sfdx deliverability:access [-l <string>] [-u <string>]`

This SFDX Plugin was created to set Email Deliverability Access Level for an org easily and quickly. This project uses Puppeteer and headless browsing to open Setup in the target org and set Email Deliverability Access Level to the desired value.

```
USAGE
  $ sfdx deliverability:access [-l <string>] [-u <string>] [--json] [--loglevel
trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]

OPTIONS
  -l, --level=level (values are not case sensitive)
      No access: None, N, 0
      System email only: System, S, 1
      All email: All, A, 2

  -u, --user=user
      Username or alias for the target org; overrides default target org

  --loglevel=(trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL)
      [default: warn] logging level for this command invocation

EXAMPLES
  sfdx deliverability:access --level All
  sfdx deliverability:access --level None
  sfdx deliverability:access --level System
  sfdx deliverability:access -l a -u gfarb@github.com
```

## Installation

```
sfdx plugins:install sfdx-deliverability-access
sfdx deliverability:access --help
```

## Requirements

1. [Node.js](https://nodejs.org/en/)
1. [Salesforce CLI](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_cli.htm)
1. [Salesforce Lightning](https://www.salesforce.com/products/platform/lightning/)
1. On macOS, [Google Chrome](https://www.google.com/chrome/) (stable) installed in its standard application location, using a build compatible with your Mac.

## Browser selection and macOS troubleshooting

On macOS, the plugin uses installed Google Chrome rather than Puppeteer 18's bundled
Chromium, which defaults to an Intel build even on Apple Silicon. This avoids relying
on Rosetta to run an Intel browser. On other operating systems, the plugin continues
to use Puppeteer's default browser selection.

To use Chrome/Chromium from a custom location on any platform, set
`PUPPETEER_EXECUTABLE_PATH` to the **executable**, not the `.app` directory:

```sh
export PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

An explicit path takes precedence over automatic selection. Invalid paths or launch
failures are reported without silently trying another browser. This plugin still
uses Puppeteer 18; a custom or newer Chrome build must also support its automation
protocol. Browser selection does not change the target org or requested access level.
Puppeteer's existing `npm_config_puppeteer_executable_path` and
`npm_package_config_puppeteer_executable_path` aliases are also honored, in that order
after `PUPPETEER_EXECUTABLE_PATH`.

On macOS, `spawn Unknown system error -86` indicates an incompatible executable CPU
type. The error alone does not identify which executable failed. The command first
invokes `npx sfdx force:org:open` to obtain an org URL, then launches the browser.
Errors parsing the org URL refer to the first step; `Unable to launch ...` errors
identify the browser selection and include the platform, Node architecture and
original launch error.

These read-only checks help diagnose an affected machine (use the actual selected
browser path in the last command):

```sh
uname -m
node -p 'process.platform + "/" + process.arch'
file "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

If Salesforce CLI uses its own Node runtime, the `node` on your shell's PATH may
have a different architecture; the plugin's launch error reports its actual runtime.
On Apple Silicon, install native ARM64 or universal Chrome. On Intel Macs, install
an Intel-compatible build. Remove or correct any stale `PUPPETEER_EXECUTABLE_PATH`
override. Installing Rosetta is not required by the macOS browser-selection fix.

Existing plugin installations do not pick up source changes automatically. Once a
maintainer releases a version containing this fix, reinstall the plugin:

```sh
sfdx plugins:uninstall sfdx-deliverability-access
sfdx plugins:install sfdx-deliverability-access
```

On macOS, the unused bundled Chromium download can optionally be skipped during
installation by prefixing the install command with `PUPPETEER_SKIP_DOWNLOAD=true`.
Installed Chrome is still required.

Before that release, developers can build this checkout with `npm install` and
`npm run build`, then use `sfdx plugins:link .` to test the local version. Linking
changes the local CLI plugin installation; running `deliverability:access` changes
the target org's email settings, so do not run it solely to test browser compatibility.
The regression tests (`npm test`) mock browser launches and do not access an org.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## Supporting Docs

- [Salesforce CLI](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_cli.htm)
- [Salesforce CLI Plug-ins](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_plugin_version.htm)
- [Salesforce Email Deliverability](https://help.salesforce.com/s/articleView?id=sf.data_sandbox_email_deliverability.htm&type=5)
- [Puppeteer](https://pptr.dev/)
