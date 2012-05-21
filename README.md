g3
==

A modification to the Graphite frontend that incorporates visualizations using D3.

This repo contains only those files that are modified, so it assumes a working Graphite install (v 0.9.9).
The files are in a directory that should match that of the Graphite install.
As it is recommended that Graphite be installed to /opt, the corresponding root of this repository is named opt.
All new files are in /opt/graphite/webapp/content/js/G3.
Modified javascript files for the dashboard and composer are one directory up in /opt/graphite/webapp/content/js.
Modified HTML templates (changed only to reference the new files) are in /opt/graphite/webapp/graphite/templates.
