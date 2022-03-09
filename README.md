
sfdx-deliverability-access
======================
## Description

This SFDX Plugin was created to set Email Deliverability Access Level for an org easily and quickly. This project uses Selenium, Webdriver and headless browsing to open Setup in the target org and set Email Deliverability Access Level to the desired value.
```
USAGE
  $ sfdx deliverability:access [-l <string>] [-u <string>] [--json] [--loglevel 
trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]

OPTIONS
  -l, --level=level
      No access: None, none, n, 0
      System email only: System, system, s, 1
      All email: All, all, a, 2

  -u, --user=user
      Username or alias for the target org; overrides default target org

  --loglevel=(trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL)
      [default: warn] logging level for this command invocation

EXAMPLES
  sfdx deliverability:access --level All
  sfdx deliverability:access --level None
  sfdx deliverability:access --level System
  sfdx deliverability:access --level a -u gfarb@github.com
```
## Version History

* 0.1

* Initial Release

## License

This project is licensed under the MIT License - see the LICENSE.md file for details
