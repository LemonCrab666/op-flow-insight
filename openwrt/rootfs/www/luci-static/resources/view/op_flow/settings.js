'use strict';
'require view';
'require form';

return view.extend({
	render: function() {
		var m = new form.Map('op-flow', '流量洞察设置',
			'修改后应用配置会重启采集服务。LAN 网段用于判断每条连接属于哪台内网主机。');
		var s = m.section(form.NamedSection, 'main', 'op-flow', '采集与存储');
		s.anonymous = true;

		var o = s.option(form.Flag, 'enabled', '启用');
		o.default = o.enabled;
		o.rmempty = false;

		o = s.option(form.DynamicList, 'lan_cidr', 'LAN 网段');
		o.placeholder = '192.168.1.0/24';
		o.rmempty = false;
		o.description = '支持 IPv4 与 IPv6 CIDR；只累计这些网段内、且不是路由器本机地址的主机。';

		o = s.option(form.ListValue, 'poll_interval', '采集间隔');
		[ [ '1s', '1 秒' ], [ '2s', '2 秒（推荐）' ], [ '5s', '5 秒' ] ].forEach(function(v) {
			o.value(v[0], v[1]);
		});
		o.default = '2s';

		o = s.option(form.ListValue, 'save_interval', '累计值落盘间隔');
		[ [ '1m', '1 分钟' ], [ '5m', '5 分钟（推荐）' ], [ '15m', '15 分钟' ] ].forEach(function(v) {
			o.value(v[0], v[1]);
		});
		o.default = '5m';
		o.description = '间隔越短，意外断电时丢失越少，但会增加闪存写入。正常停机会立即保存。';

		o = s.option(form.Value, 'max_flows', '页面最大连接数');
		o.datatype = 'range(10,10000)';
		o.default = '500';

		s = m.section(form.NamedSection, 'main', 'op-flow', '离线数据');
		s.anonymous = true;

		o = s.option(form.Flag, 'auto_update', '自动更新');
		o.default = o.enabled;
		o.rmempty = false;

		o = s.option(form.ListValue, 'update_interval', '更新间隔');
		[ [ '12h', '12 小时' ], [ '24h', '24 小时（推荐）' ], [ '72h', '3 天' ], [ '168h', '7 天' ] ].forEach(function(v) {
			o.value(v[0], v[1]);
		});
		o.default = '24h';
		o.description = '数据从 GitHub 公开项目下载到本机，连接 IP 不会发送给第三方查询接口。';

		return m.render();
	}
});

