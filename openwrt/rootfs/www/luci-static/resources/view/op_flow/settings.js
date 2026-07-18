'use strict';
'require view';
'require form';

return view.extend({
	render: function() {
		var m = new form.Map('op-flow', _('Flow Insight Settings'),
			_('Applying changes restarts the collector. LAN networks determine which host owns each connection.'));
		var s = m.section(form.NamedSection, 'main', 'op-flow', _('Collection and storage'));
		s.anonymous = true;

		var o = s.option(form.Flag, 'enabled', _('Enable'));
		o.default = o.enabled;
		o.rmempty = false;

		o = s.option(form.DynamicList, 'lan_cidr', _('LAN networks'));
		o.placeholder = '192.168.1.0/24';
		o.rmempty = false;
		o.description = _('Supports IPv4 and IPv6 CIDRs. Only hosts inside these networks, excluding the router itself, are counted.') +
			' ' + _('Delegated global IPv6 prefixes on LAN interfaces are detected automatically through ubus.');

		o = s.option(form.ListValue, 'poll_interval', _('Collection interval'));
		[ [ '1s', _('1 second') ], [ '2s', _('2 seconds (recommended)') ],
			[ '5s', _('5 seconds') ] ].forEach(function(v) {
			o.value(v[0], v[1]);
		});
		o.default = '2s';

		o = s.option(form.ListValue, 'save_interval', _('Cumulative state save interval'));
		[ [ '1m', _('1 minute') ], [ '5m', _('5 minutes (recommended)') ],
			[ '15m', _('15 minutes') ] ].forEach(function(v) {
			o.value(v[0], v[1]);
		});
		o.default = '5m';
		o.description = _('A shorter interval reduces loss after unexpected power failure but increases flash writes. A normal shutdown saves immediately.');

		o = s.option(form.Value, 'max_flows', _('Maximum connections shown'));
		o.datatype = 'range(10,10000)';
		o.default = '500';

		s = m.section(form.NamedSection, 'main', 'op-flow', _('Offline data'));
		s.anonymous = true;

		o = s.option(form.Flag, 'auto_update', _('Automatic updates'));
		o.default = o.enabled;
		o.rmempty = false;

		o = s.option(form.ListValue, 'update_interval', _('Update interval'));
		[ [ '12h', _('12 hours') ], [ '24h', _('24 hours (recommended)') ],
			[ '72h', _('3 days') ], [ '168h', _('7 days') ] ].forEach(function(v) {
			o.value(v[0], v[1]);
		});
		o.default = '24h';
		o.description = _('Datasets are downloaded from public GitHub projects. Connection IPs are never sent to a third-party lookup API.');

		return m.render();
	}
});
