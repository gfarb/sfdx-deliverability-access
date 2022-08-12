# sfdx-deliverability-access

## `sfdx deliverability:access [-l <string>] [-u <string>]`

This SFDX Plugin was created to set Email Deliverability Access Level for an org easily and quickly. This project uses Selenium, Webdriver and headless browsing to open Setup in the target org and set Email Deliverability Access Level to the desired value.

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

1. [Google Chrome](https://www.google.com/chrome)
2. [Node.js](https://nodejs.org/en/)
3. [Salesforce CLI](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_cli.htm)
4. [Salesforce Lightning](https://www.salesforce.com/products/platform/lightning/)

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## Supporting Docs

- [Salesforce CLI](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_cli.htm)
- [Salesforce CLI Plug-ins](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_plugin_version.htm)
- [Salesforce Email Deliverability](https://help.salesforce.com/s/articleView?id=sf.data_sandbox_email_deliverability.htm&type=5)
