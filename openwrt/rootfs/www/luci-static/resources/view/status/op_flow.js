'use strict';
'require view';
'require rpc';
'require dom';
'require ui';

var callDashboard = rpc.declare({
	object: 'op-flow',
	method: 'dashboard',
	expect: {}
});

var callUpdate = rpc.declare({
	object: 'op-flow',
	method: 'update',
	expect: {}
});

function ensureStyles() {
	var critical = document.getElementById('op-flow-insight-critical-style');
	if (!critical) {
		critical = document.createElement('style');
		critical.id = 'op-flow-insight-critical-style';
		critical.textContent =
			'.ofi-root{clear:both!important;display:block!important;float:none!important;' +
				'margin:0!important;max-width:100%!important;min-width:0!important;' +
				'position:relative!important;width:100%!important}' +
			'.ofi-root>.ofi-header,.ofi-root>.ofi-stats,.ofi-root>.ofi-workspace,' +
			'.ofi-root>.ofi-footnote,.ofi-root .ofi-panel{float:none!important;' +
				'max-width:100%!important;position:relative!important;width:100%!important}' +
			'.ofi-root .ofi-table-scroll{display:block!important;max-width:100%!important;' +
				'overflow-x:auto!important;width:100%!important}';
		document.head.appendChild(critical);
	}

	var stylesheet = document.getElementById('op-flow-insight-stylesheet');
	if (!stylesheet) {
		stylesheet = document.createElement('link');
		stylesheet.id = 'op-flow-insight-stylesheet';
		stylesheet.rel = 'stylesheet';
		stylesheet.type = 'text/css';
		stylesheet.href = L.resource('op-flow.css') + '?v=0.1.1-r6';
		document.head.appendChild(stylesheet);
	}
	return stylesheet;
}

function bytes(value) {
	var n = Number(value || 0);
	var units = [ 'B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB' ];
	var i = 0;
	while (n >= 1024 && i < units.length - 1) {
		n /= 1024;
		i++;
	}
	return (i === 0 ? n.toFixed(0) : n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)) + ' ' + units[i];
}

function rate(value) {
	return bytes(value) + '/s';
}

function text(value, fallback) {
	return value === undefined || value === null || value === '' ? (fallback || '—') : String(value);
}

function riskClass(score) {
	if (score >= 80) return 'critical';
	if (score >= 60) return 'high';
	if (score >= 40) return 'medium';
	if (score >= 20) return 'guarded';
	return 'low';
}

function riskBadge(risk) {
	risk = risk || { score: 0, evidence: [] };
	var evidence = (risk.evidence || []).map(function(item) {
		return item.source + (item.detail ? ' · ' + item.detail : '');
	}).join('\n');
	var title = risk.score === 0
		? _('Not found in the loaded datasets; this does not mean the IP is known to be safe')
		: evidence;
	return E('span', {
		'class': 'ofi-risk ofi-risk-' + riskClass(Number(risk.score || 0)),
		'title': title
	}, String(risk.score || 0));
}

function endpoint(value) {
	if (!value) return '—';
	var ip = text(value.ip);
	if (ip.indexOf(':') >= 0) ip = '[' + ip + ']';
	return ip + (value.port ? ':' + value.port : '');
}

function country(value) {
	var code = text(value);
	if (code === '—' || code === 'LAN') return code === 'LAN' ? _('LAN') : code;
	try {
		if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
			var language = document.documentElement.lang ||
				(typeof navigator !== 'undefined' && navigator.language) || 'en';
			var name = new Intl.DisplayNames([ language ], { type: 'region' }).of(code);
			if (name && name !== code) return name + ' (' + code + ')';
		}
	} catch (e) {}
	return code;
}

function stat(label, value, accent) {
	return E('div', { 'class': 'ofi-stat' + (accent ? ' ofi-stat-' + accent : '') }, [
		E('div', { 'class': 'ofi-stat-label' }, label),
		E('div', { 'class': 'ofi-stat-value' }, value)
	]);
}

function svgNode(name, attributes, children) {
	var node = document.createElementNS('http://www.w3.org/2000/svg', name);
	Object.keys(attributes || {}).forEach(function(key) {
		node.setAttribute(key, String(attributes[key]));
	});
	(children || []).forEach(function(child) {
		node.appendChild(child);
	});
	return node;
}

function timeLabel(value, fallback) {
	var date = value ? new Date(value) : null;
	if (!date || isNaN(date.getTime())) return fallback;
	return date.toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});
}

function warningText(value) {
	value = String(value || '');
	var dynamic = [
		[
			'Cumulative state file is damaged; restarted from current connections: ',
			_('Cumulative state file is damaged; restarted from current connections: ')
		],
		[
			'Unable to read conntrack: ',
			_('Unable to read conntrack: ')
		],
		[
			'Unable to detect LAN prefixes through ubus; using configured prefixes: ',
			_('Unable to detect LAN prefixes through ubus; using configured prefixes: ')
		],
		[
			'Conntrack destroy events are unavailable; very short connections may be undercounted: ',
			_('Conntrack destroy events are unavailable; very short connections may be undercounted: ')
		],
		[
			'Failed to save cumulative state: ',
			_('Failed to save cumulative state: ')
		]
	];
	for (var i = 0; i < dynamic.length; i++) {
		if (value.indexOf(dynamic[i][0]) === 0)
			return dynamic[i][1] + value.slice(dynamic[i][0].length);
	}
	return _(value);
}

function sparkline(points) {
	points = points || [];
	if (points.length < 2) {
		return E('div', { 'class': 'ofi-chart-empty' },
			_('The trend appears after several samples are collected'));
	}
	var max = 1;
	points.forEach(function(p) {
		max = Math.max(max, Number(p.upload_bps || 0), Number(p.download_bps || 0));
	});
	function path(key) {
		return points.map(function(p, index) {
			var x = (index / (points.length - 1)) * 100;
			var y = 38 - (Number(p[key] || 0) / max) * 34;
			return (index ? 'L' : 'M') + x.toFixed(2) + ',' + y.toFixed(2);
		}).join(' ');
	}
	var middle = points[Math.floor((points.length - 1) / 2)];
	var startLabel = timeLabel(points[0].at, _('About 10 minutes ago'));
	var middleLabel = timeLabel(middle.at, _('About 5 minutes ago'));
	var endLabel = timeLabel(points[points.length - 1].at, _('Now'));
	return E('div', { 'class': 'ofi-chart-wrap' }, [
		E('div', { 'class': 'ofi-chart-stage' }, [
			E('div', { 'class': 'ofi-axis-title ofi-axis-title-y' }, _('Rate')),
			E('div', { 'class': 'ofi-y-scale', 'aria-hidden': 'true' }, [
				E('span', {}, rate(max)),
				E('span', {}, rate(max / 2)),
				E('span', {}, '0 B/s')
			]),
			E('div', { 'class': 'ofi-plot' }, [
				svgNode('svg', {
					'class': 'ofi-chart',
					'viewBox': '0 0 100 40',
					'preserveAspectRatio': 'none',
					'role': 'img',
					'aria-label': _('Live upload and download bandwidth trend with time on the horizontal axis and rate on the vertical axis')
				}, [
					svgNode('path', {
						'class': 'ofi-grid',
						'd': 'M0,38 L100,38 M0,20 L100,20 M0,2 L100,2'
					}),
					svgNode('path', {
						'class': 'ofi-line ofi-line-down',
						'd': path('download_bps')
					}),
					svgNode('path', {
						'class': 'ofi-line ofi-line-up',
						'd': path('upload_bps')
					})
				]),
				E('div', { 'class': 'ofi-x-scale', 'aria-hidden': 'true' }, [
					E('span', {}, startLabel),
					E('span', {}, middleLabel),
					E('span', {}, endLabel)
				])
			])
		]),
		E('div', { 'class': 'ofi-axis-title ofi-axis-title-x' }, _('Time')),
		E('div', { 'class': 'ofi-legend' }, [
			E('span', { 'class': 'ofi-key ofi-key-down' }, _('Download')),
			E('span', { 'class': 'ofi-key ofi-key-up' }, _('Upload')),
			E('span', { 'class': 'ofi-chart-max' }, _('Peak') + ' ' + rate(max))
		])
	]);
}

function compareHostIP(left, right) {
	left = String(left || '');
	right = String(right || '');
	var left4 = left.split('.');
	var right4 = right.split('.');
	if (left4.length === 4 && right4.length === 4) {
		for (var i = 0; i < 4; i++) {
			var difference = Number(left4[i]) - Number(right4[i]);
			if (difference) return difference;
		}
		return 0;
	}
	if (left4.length === 4) return -1;
	if (right4.length === 4) return 1;
	try {
		return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
	} catch (e) {
		return left < right ? -1 : left > right ? 1 : 0;
	}
}

function orderedHosts(hosts) {
	return (hosts || []).slice().sort(function(left, right) {
		return compareHostIP(left.ip, right.ip);
	});
}

function hostLabel(host) {
	return text(host && host.hostname, _('Unnamed host')) + ' · ' + text(host && host.ip);
}

function hostRows(hosts, selectedHostIP, onSelect) {
	if (!hosts || !hosts.length) {
		return [ E('tr', {}, [ E('td', { 'colspan': 7, 'class': 'ofi-empty' },
			_('No LAN host connections have been observed yet')) ]) ];
	}
	return hosts.map(function(host) {
		var activate = function(event) {
			if (event && event.type === 'keydown' &&
				event.key !== 'Enter' && event.key !== ' ') return;
			if (event) {
				event.preventDefault();
				event.stopPropagation();
			}
			onSelect(host);
		};
		return E('tr', {
			'class': 'ofi-host-row' + (host.ip === selectedHostIP ? ' ofi-host-selected' : ''),
			'data-host': host.ip,
			'tabindex': '0',
			'role': 'button',
			'aria-label': _('View current connections for') + ' ' + hostLabel(host),
			'aria-selected': host.ip === selectedHostIP ? 'true' : 'false',
			'title': _('Click to view current connections for this host'),
			'click': activate,
			'keydown': activate
		}, [
			E('td', {}, [
				E('strong', {}, text(host.hostname, _('Unnamed host'))),
				E('div', { 'class': 'ofi-mono ofi-subtle' }, host.ip),
				host.mac ? E('div', { 'class': 'ofi-mono ofi-subtle' }, host.mac) : ''
			]),
			E('td', { 'class': 'ofi-num ofi-down' }, rate(host.download_bps)),
			E('td', { 'class': 'ofi-num ofi-up' }, rate(host.upload_bps)),
			E('td', { 'class': 'ofi-num' }, bytes(host.downloaded)),
			E('td', { 'class': 'ofi-num' }, bytes(host.uploaded)),
			E('td', { 'class': 'ofi-num' }, String(host.active_flows || 0)),
			E('td', { 'class': 'ofi-num' }, riskBadge({ score: host.max_risk || 0 }))
		]);
	});
}

function flowRows(flows, emptyMessage) {
	if (!flows || !flows.length) {
		return [ E('tr', {}, [
			E('td', { 'colspan': 8, 'class': 'ofi-empty' },
				emptyMessage || _('There are no active connections to display'))
		]) ];
	}
	return flows.map(function(flow) {
		var geo = flow.geo || {};
		var place = country(geo.country_code);
		var asn = geo.asn ? 'AS' + geo.asn + ' · ' + text(geo.asn_org) : text(geo.asn_org);
		return E('tr', { 'data-host': flow.host_ip || '' }, [
			E('td', {}, [
				E('span', { 'class': 'ofi-direction ofi-direction-' + flow.direction },
					flow.direction === 'inbound' ? _('Inbound') : _('Outbound')),
				E('span', { 'class': 'ofi-proto' }, text(flow.protocol).toUpperCase())
			]),
			E('td', { 'class': 'ofi-mono' }, endpoint(flow.source)),
			E('td', { 'class': 'ofi-arrow' }, '→'),
			E('td', { 'class': 'ofi-mono' }, endpoint(flow.destination)),
			E('td', {}, [
				E('div', {}, place),
				E('div', { 'class': 'ofi-subtle', 'title': asn }, asn)
			]),
			E('td', { 'class': 'ofi-num ofi-down' }, rate(flow.download_bps)),
			E('td', { 'class': 'ofi-num ofi-up' }, rate(flow.upload_bps)),
			E('td', { 'class': 'ofi-num' }, riskBadge(flow.risk))
		]);
	});
}

function table(head, body, className) {
	return E('div', { 'class': 'ofi-table-scroll' }, [
		E('table', { 'class': 'ofi-table ' + (className || '') }, [
			E('thead', {}, [ E('tr', {}, head.map(function(item) { return E('th', {}, item); })) ]),
			E('tbody', {}, body)
		])
	]);
}

function tabButton(name, label, active, disabled, onSelect) {
	return E('button', {
		'type': 'button',
		'class': 'ofi-tab' + (active ? ' ofi-tab-active' : ''),
		'role': 'tab',
		'aria-selected': active ? 'true' : 'false',
		'aria-disabled': disabled ? 'true' : 'false',
		'disabled': disabled ? '' : null,
		'click': function(event) {
			event.preventDefault();
			if (!disabled) onSelect(name);
		}
	}, label);
}

function darkThemeActive() {
	var elements = [
		document.body,
		document.querySelector('.main-right'),
		document.documentElement
	];

	for (var i = 0; i < elements.length; i++) {
		if (!elements[i]) continue;
		var value = window.getComputedStyle(elements[i]).backgroundColor;
		var match = value && value.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
		if (!match) continue;
		var red = Number(match[1]);
		var green = Number(match[2]);
		var blue = Number(match[3]);
		var luminance = (red * 299 + green * 587 + blue * 114) / 1000;
		if (luminance < 128) return true;
		if (luminance >= 200) return false;
	}

	return window.matchMedia &&
		window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function syncThemeLayout(root) {
	if (!root || !root.isConnected) return;
	var rootRect = root.getBoundingClientRect();
	var offset = 0;
	var candidates = document.querySelectorAll(
		'header, #header, .header, .navbar, .topbar, .top-bar, .app-header'
	);

	Array.prototype.forEach.call(candidates, function(element) {
		if (element === root || root.contains(element)) return;
		var style = window.getComputedStyle(element);
		if (style.display === 'none' || style.visibility === 'hidden') return;
		var rect = element.getBoundingClientRect();
		var horizontalOverlap = Math.min(rootRect.right, rect.right) -
			Math.max(rootRect.left, rect.left);
		if (rect.height < 24 || rect.bottom > Math.min(window.innerHeight * .4, 240)) return;
		if (rect.top > rootRect.top + 2 || rect.bottom <= rootRect.top + 1) return;
		if (horizontalOverlap < Math.min(48, rootRect.width * .1)) return;
		offset = Math.max(offset, Math.ceil(rect.bottom - rootRect.top + 12));
	});

	root.style.setProperty('--ofi-top-offset', offset + 'px');
}

function scheduleThemeLayout(root) {
	if (!root) return;
	if (root._ofiLayoutFrame) window.cancelAnimationFrame(root._ofiLayoutFrame);
	root._ofiLayoutFrame = window.requestAnimationFrame(function() {
		root._ofiLayoutFrame = null;
		syncThemeLayout(root);
	});
}

return view.extend({
	load: function() {
		return callDashboard().catch(function(err) {
			return { error: err.message || String(err) };
		});
	},

	render: function(data) {
		var stylesheet = ensureStyles();
		this.root = E('div', {
			'class': 'ofi-root' + (darkThemeActive() ? ' ofi-dark' : '')
		});
		if (!stylesheet.sheet) {
			stylesheet.addEventListener('load', L.bind(function() {
				scheduleThemeLayout(this.root);
			}, this), { once: true });
		}
		if (!this._ofiResizeHandler) {
			this._ofiResizeHandler = L.bind(function() {
				scheduleThemeLayout(this.root);
			}, this);
			window.addEventListener('resize', this._ofiResizeHandler);
		}
		this.activeTab = this.activeTab || 'trend';
		this.selectedHostIP = this.selectedHostIP || '';
		this.renderData(data);
		L.Poll.add(L.bind(function() {
			return callDashboard().then(L.bind(this.renderData, this)).catch(function() {});
		}, this), 2);
		return this.root;
	},

	renderData: function(data) {
		if (!this.root) return;
		this.lastData = data;
		this.root.classList.toggle('ofi-dark', darkThemeActive());
		scheduleThemeLayout(this.root);
		if (!data || data.error) {
			dom.content(this.root, [
				E('h2', {}, _('Flow Insight')),
				E('div', { 'class': 'alert-message error' },
					_('Unable to connect to the backend service:') + ' ' +
					text(data && data.error, _('Make sure the op-flow service is running')))
			]);
			return;
		}
		var totals = data.totals || {};
		var health = data.health || {};
		var dataStatus = data.data || {};
		var hosts = orderedHosts(data.hosts);
		var selectedHost = null;
		for (var hostIndex = 0; hostIndex < hosts.length; hostIndex++) {
			if (hosts[hostIndex].ip === this.selectedHostIP) {
				selectedHost = hosts[hostIndex];
				break;
			}
		}
		if (!selectedHost && this.selectedHostIP) {
			this.selectedHostIP = '';
			if (this.activeTab === 'connections') this.activeTab = 'hosts';
		}
		var selectedFlows = selectedHost ? (data.flows || []).filter(function(flow) {
			return flow.host_ip === selectedHost.ip;
		}) : [];
		var self = this;
		var selectTab = function(name) {
			self.activeTab = name;
			self.renderData(self.lastData);
		};
		var selectHost = function(host) {
			self.selectedHostIP = host.ip;
			self.activeTab = 'connections';
			self.pendingDetailFocus = true;
			self.renderData(self.lastData);
		};
		var warnings = (health.warnings || []).map(function(item) {
			return E('div', { 'class': 'alert-message warning' }, warningText(item));
		});
		if (!dataStatus.loaded) {
			warnings.push(E('div', { 'class': 'alert-message warning' },
				_('The offline attribution and risk database is not loaded. Click "Update datasets"; traffic accounting continues to work during the update.')));
		}
		var updated = dataStatus.updated_at
			? new Date(dataStatus.updated_at).toLocaleString()
			: _('Never updated');
		var content = [
			E('div', { 'class': 'ofi-header' }, [
				E('div', {}, [
					E('h2', {}, _('Flow Insight')),
					E('p', { 'class': 'ofi-lead' },
						_('Cumulative LAN-host usage, live connections, and offline IP risk evidence'))
				]),
				E('div', { 'class': 'ofi-actions' }, [
					E('span', { 'class': 'ofi-live' }, [
						E('span', { 'class': 'ofi-live-dot' }), _('Refreshes every 2 seconds')
					]),
					E('button', {
						'class': 'btn cbi-button-action',
						'disabled': dataStatus.update_running ? '' : null,
						'click': ui.createHandlerFn(this, function() {
							return callUpdate().then(function() {
								ui.addNotification(null, E('p', {},
									_('Dataset update started in the background.')));
							});
						})
					}, dataStatus.update_running ? _('Updating…') : _('Update datasets'))
				])
			])
		].concat(warnings);
		var activePanel;
		if (this.activeTab === 'hosts') {
			activePanel = E('section', {
				'class': 'ofi-panel ofi-tab-panel',
				'role': 'tabpanel',
				'data-ofi-panel': 'hosts'
			}, [
				E('div', { 'class': 'ofi-panel-title' }, [
					E('div', {}, [
						E('h3', {}, _('LAN hosts')),
						E('div', { 'class': 'ofi-panel-hint' },
							_('Sorted by IP address; click a row to view the host\'s current connections'))
					]),
					E('span', { 'class': 'ofi-subtle' },
						String(hosts.length) + ' ' + _('hosts recorded'))
				]),
				table(
					[
						_('Host'), _('Live download'), _('Live upload'),
						_('Downloaded'), _('Uploaded'), _('Connections'), _('Risk')
					],
					hostRows(hosts, this.selectedHostIP, selectHost),
					'ofi-host-table'
				)
			]);
		} else if (this.activeTab === 'connections' && selectedHost) {
			activePanel = E('section', {
				'class': 'ofi-panel ofi-tab-panel',
				'role': 'tabpanel',
				'tabindex': '-1',
				'data-ofi-panel': 'connections'
			}, [
				E('div', { 'class': 'ofi-panel-title' }, [
					E('div', {}, [
						E('h3', {}, _('Current connections') + ' · ' +
							text(selectedHost.hostname, _('Unnamed host'))),
						E('div', { 'class': 'ofi-panel-hint ofi-mono' },
							selectedHost.ip + (selectedHost.mac ? ' · ' + selectedHost.mac : ''))
					]),
					E('span', { 'class': 'ofi-subtle' },
						String(selectedFlows.length) + ' ' + _('active connections'))
				]),
				E('div', { 'class': 'ofi-detail-summary' }, [
					E('span', {}, [ _('Live download') + ' ',
						E('strong', { 'class': 'ofi-down' }, rate(selectedHost.download_bps)) ]),
					E('span', {}, [ _('Live upload') + ' ',
						E('strong', { 'class': 'ofi-up' }, rate(selectedHost.upload_bps)) ]),
					E('span', {}, _('Downloaded') + ' ' + bytes(selectedHost.downloaded)),
					E('span', {}, _('Uploaded') + ' ' + bytes(selectedHost.uploaded))
				]),
				table(
					[
						_('Direction'), _('Source IP'), '', _('Destination IP'),
						_('Attribution / ASN'), _('Download'), _('Upload'), _('Risk')
					],
					flowRows(selectedFlows, _('This host has no active connections')),
					'ofi-flow-table'
				)
			]);
		} else {
			this.activeTab = 'trend';
			activePanel = E('section', {
				'class': 'ofi-panel ofi-tab-panel',
				'role': 'tabpanel',
				'data-ofi-panel': 'trend'
			}, [
				E('div', { 'class': 'ofi-panel-title' }, [
					E('h3', {}, _('Live bandwidth trend')),
					E('span', { 'class': 'ofi-subtle' }, _('About the last 10 minutes'))
				]),
				sparkline(data.history)
			]);
		}
		content.push(
			E('div', { 'class': 'ofi-stats' }, [
				stat(_('Current download'), rate(totals.download_bps), 'down'),
				stat(_('Current upload'), rate(totals.upload_bps), 'up'),
				stat(_('Total downloaded'), bytes(totals.downloaded)),
				stat(_('Total uploaded'), bytes(totals.uploaded)),
				stat(_('Active hosts / connections'),
					(totals.active_hosts || 0) + ' / ' + (totals.active_flows || 0)),
				stat(_('Current highest risk'), String(totals.highest_risk || 0),
					riskClass(totals.highest_risk || 0))
			]),
			E('div', { 'class': 'ofi-workspace' }, [
				E('div', {
					'class': 'ofi-tabs',
					'role': 'tablist',
					'aria-label': _('Flow Insight sections')
				}, [
					tabButton('trend', _('Live trend'), this.activeTab === 'trend', false, selectTab),
					tabButton('hosts', [
						_('LAN hosts'),
						E('span', { 'class': 'ofi-tab-count' }, String(hosts.length))
					], this.activeTab === 'hosts', false, selectTab),
					tabButton('connections', [
						_('Current connections'),
						selectedHost ? E('span', { 'class': 'ofi-tab-count' }, String(selectedFlows.length)) : ''
					], this.activeTab === 'connections', !selectedHost, selectTab)
				]),
				activePanel
			]),
			E('section', { 'class': 'ofi-footnote' }, [
				E('strong', {}, _('Risk score:') + ' '),
				_('A score of 0 means the IP was not observed in the loaded datasets; it does not mean safe. The score starts with the most severe evidence, adds 5 for each additional independent source, and is capped at 100. It is only a triage aid and never blocks an IP automatically.'),
				E('br'),
				_('Data updated:') + ' ' + updated + '. ' +
				_('Attribution is limited to country/region and ASN, and all lookups run locally on the router.'),
				E('br'),
				_('Monitored LAN prefixes:') + ' ' +
				((health.lan_prefixes || []).join(', ') || '—')
			])
		);
		dom.content(this.root, content);
		if (this.pendingDetailFocus) {
			this.pendingDetailFocus = false;
			window.requestAnimationFrame(function() {
				var panel = self.root && self.root.querySelector('[data-ofi-panel="connections"]');
				if (!panel) return;
				panel.scrollIntoView({ block: 'start' });
				try {
					panel.focus({ preventScroll: true });
				} catch (e) {
					panel.focus();
				}
			});
		}
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
