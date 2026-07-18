# 第三方数据源声明

本项目代码采用 MIT License。安装包不内置、也不重新分发任何 IP 数据库；路由器仅在用户启用自动更新或手动点击更新后，从以下公开地址下载数据。各数据集仍分别受其自身许可证与使用条款约束。

| 用途 | 项目 / 文件 | 项目声明的许可或性质 |
|---|---|---|
| 国家/地区归属 | [sapics/ip-location-db `user-country`](https://github.com/sapics/ip-location-db) | PDDL 1.0；每日更新 |
| ASN 归属 | [sapics/ip-location-db `origin-asn`](https://github.com/sapics/ip-location-db) | PDDL 1.0；每日更新 |
| 多黑名单命中次数 | [stamparm/ipsum](https://github.com/stamparm/ipsum) | Unlicense；聚合 30+ 公开列表，每日更新 |
| Spamhaus DROP/EDROP、DShield、Feodo 镜像 | [firehol/blocklist-ipsets](https://github.com/firehol/blocklist-ipsets) | FireHOL 仓库为公开镜像；每个上游列表可能有独立条款 |
| Abuse / Malware IP | [blocklistproject/Lists](https://github.com/blocklistproject/Lists) | Unlicense |

特别说明：

- Spamhaus、DShield、Feodo 等上游数据的权利与限制不会因为其被 GitHub 镜像而消失。部署者应确认自己的使用场景符合各上游条款。
- 风险评分只是多个公开证据的可解释归一化结果，不是对个人或组织的事实认定，也不是自动封禁依据。
- IP 归属数据存在误差，默认只展示国家/地区和 ASN，不应用于识别个人、住户或精确物理地址。

