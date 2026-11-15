# {{PROJECT}}: traffic in and out
<!-- covers new files: infra/** -->

What may reach the app, what the app may reach, and which addresses are allowed or blocked. The lists below are made from
`workflow.config.json` by `npm run map`, so they always match what the gate and the firewall use; the reasons are in
`docs/INFRA.md` (*Traffic in and out*, *IP allow and block lists*). Change the config, never this page's lists by hand.

## In (ingress)
| Port | Open to | Goes to |
|---|---|---|
| 443 (and 80, redirect only) | the internet | the proxy, then the app |
| <admin, metrics, SSH> | the VPN only | <where> |

## Out (egress): the hosts the app may call
<!-- generated: egress -->
<!-- /generated -->

Each host and what data goes there is also a row in the privacy record when personal data goes with it.

## IP rules
<!-- generated: iprules -->
<!-- /generated -->
