# Changelog

[简体中文](CHANGELOG.md) | [English](CHANGELOG_EN.md) |
[日本語](CHANGELOG_JA.md)

Several local iterations were completed before the public repository was
created. Releases `r1` through `r4` did not preserve separate source commits and
are therefore published as historical binary archives. GitHub's automatically
generated “Source code” archives do not represent those older versions.
Starting with `r5`, release tags correspond to source commits.

## 0.1.1-r6

- Switched the LuCI source and fallback UI to English and adopted LuCI's `_()`
  translation API throughout.
- Added the optional `luci-i18n-op-flow-zh-cn` Simplified Chinese package.
- Added the optional `luci-i18n-op-flow-ja` Japanese package; the default
  English UI needs no language package.
- Converted backend health warnings to stable English messages and translated
  them in the UI.
- Automatically discovers ISP-delegated global IPv6 prefixes on LAN interfaces
  through ubus, fixing missing live and cumulative traffic when Speedtest or
  other traffic uses IPv6; the UI exposes the prefixes currently monitored.
- Versioned the stylesheet URL, reran layout after stylesheet loading, and
  added plugin-scoped critical layout protection to prevent stale PC browser
  CSS and LuCI theme overrides from breaking the page.
- Increased column space for longer English/Japanese headers and retained
  contained horizontal scrolling, header/data alignment, blue download, and
  green upload semantics.
- Added translation coverage checks and APK/IPK workflow verification for
  language-package metadata, architecture, and LMO contents.
- Passed browser layout regression at 2560, 1920, 1280, 768 dark, and 480 dark
  viewport widths.

## 0.1.1-r5

- Added a time x-axis, rate y-axis, and adaptive units to the live bandwidth chart.
- Added **Live trend / LAN hosts / Current connections** tabs.
- Clicking a LAN host opens and filters that host's current connections.
- Hosts are sorted by numeric IP and remain in a stable position when traffic changes.
- Preserved the blue download and green upload visual semantics.
- Fixed the APK upgrade hook's non-zero exit that caused a misleading installation error.
- Verified layouts in light and dark themes at multiple viewport widths.

## 0.1.1-r4

- Created trend paths in the SVG namespace, fixing charts that showed a legend but no curves.
- Corrected the top-right toolbar position across LuCI themes.
- Corrected host table header and data-column alignment.
- Kept download values blue and upload values green.
- Further improved responsive layout during browser zoom.

## 0.1.1-r3

- Added a neutral gray dark-theme palette to reduce harsh black/white contrast.
- Isolated plugin styles to reduce interference from global LuCI theme rules.
- Added flexible, grid, and responsive layouts for themes, resolutions, and zoom levels.
- Improved cards, tables, and connection details on narrow screens.

## 0.1.1-r2

- Added a Flow Insight status dashboard that displays live data.
- Added live upload/download, cumulative usage, host count, connection count, and highest risk.
- Added LAN host and current-connection tables.
- Added x86_64 IPK build and installation support for ImmortalWrt 24.10.x / OpenWrt opkg.

## 0.1.1-r1

- First native ImmortalWrt 25.12.0 x86_64 APK v3.
- Added cumulative upload/download and live-rate collection per LAN host.
- Collected conntrack source/destination IPs, ports, and direction.
- Added offline country/region and ASN attribution.
- Added explainable 0–100 IP risk scores based on public GitHub threat datasets.
- Added LuCI settings, UCI configuration, rpcd ACL, and procd service integration.
