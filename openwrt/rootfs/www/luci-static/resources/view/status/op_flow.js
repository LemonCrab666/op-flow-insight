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
		? '未在已加载的数据集中发现；不代表该 IP 已知安全'
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
	if (code === '—' || code === 'LAN') return code === 'LAN' ? '内网' : code;
	try {
		if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
			var name = new Intl.DisplayNames([ 'zh-CN' ], { type: 'region' }).of(code);
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

function sparkline(points) {
	points = points || [];
	if (points.length < 2) {
		return E('div', { 'class': 'ofi-chart-empty' }, '采集数个数据点后显示趋势');
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
	var startLabel = timeLabel(points[0].at, '约 10 分钟前');
	var middleLabel = timeLabel(middle.at, '约 5 分钟前');
	var endLabel = timeLabel(points[points.length - 1].at, '现在');
	return E('div', { 'class': 'ofi-chart-wrap' }, [
		E('div', { 'class': 'ofi-chart-stage' }, [
			E('div', { 'class': 'ofi-axis-title ofi-axis-title-y' }, '速率'),
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
					'aria-label': '横轴为时间、纵轴为速率的实时上传和下载带宽趋势'
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
		E('div', { 'class': 'ofi-axis-title ofi-axis-title-x' }, '时间'),
		E('div', { 'class': 'ofi-legend' }, [
			E('span', { 'class': 'ofi-key ofi-key-down' }, '下载'),
			E('span', { 'class': 'ofi-key ofi-key-up' }, '上传'),
			E('span', { 'class': 'ofi-chart-max' }, '峰值 ' + rate(max))
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
	return text(host && host.hostname, '未命名主机') + ' · ' + text(host && host.ip);
}

function hostRows(hosts, selectedHostIP, onSelect) {
	if (!hosts || !hosts.length) {
		return [ E('tr', {}, [ E('td', { 'colspan': 7, 'class': 'ofi-empty' }, '暂未观察到内网主机连接') ]) ];
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
			'aria-label': '查看 ' + hostLabel(host) + ' 的当前连接',
			'aria-selected': host.ip === selectedHostIP ? 'true' : 'false',
			'title': '点击查看该主机的当前连接',
			'click': activate,
			'keydown': activate
		}, [
			E('td', {}, [
				E('strong', {}, text(host.hostname, '未命名主机')),
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
				emptyMessage || '当前没有可展示的活动连接')
		]) ];
	}
	return flows.map(function(flow) {
		var geo = flow.geo || {};
		var place = country(geo.country_code);
		var asn = geo.asn ? 'AS' + geo.asn + ' · ' + text(geo.asn_org) : text(geo.asn_org);
		return E('tr', { 'data-host': flow.host_ip || '' }, [
			E('td', {}, [
				E('span', { 'class': 'ofi-direction ofi-direction-' + flow.direction },
					flow.direction === 'inbound' ? '入站' : '出站'),
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
		document.head.appendChild(E('link', {
			'rel': 'stylesheet',
			'type': 'text/css',
			'href': L.resource('op-flow.css')
		}));
		this.root = E('div', {
			'class': 'ofi-root' + (darkThemeActive() ? ' ofi-dark' : '')
		});
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
				E('h2', {}, '流量洞察'),
				E('div', { 'class': 'alert-message error' },
					'无法连接后台服务：' + text(data && data.error, '请确认 op-flow 服务正在运行'))
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
			return E('div', { 'class': 'alert-message warning' }, item);
		});
		if (!dataStatus.loaded) {
			warnings.push(E('div', { 'class': 'alert-message warning' },
				'离线归属地/风险库尚未加载。点击“更新数据集”，完成前流量统计仍可正常工作。'));
		}
		var updated = dataStatus.updated_at
			? new Date(dataStatus.updated_at).toLocaleString()
			: '尚未更新';
		var content = [
			E('div', { 'class': 'ofi-header' }, [
				E('div', {}, [
					E('h2', {}, '流量洞察'),
					E('p', { 'class': 'ofi-lead' }, '内网主机累计用量、实时连接与离线 IP 风险证据')
				]),
				E('div', { 'class': 'ofi-actions' }, [
					E('span', { 'class': 'ofi-live' }, [
						E('span', { 'class': 'ofi-live-dot' }), '每 2 秒刷新'
					]),
					E('button', {
						'class': 'btn cbi-button-action',
						'disabled': dataStatus.update_running ? '' : null,
						'click': ui.createHandlerFn(this, function() {
							return callUpdate().then(function() {
								ui.addNotification(null, E('p', {}, '数据集更新已在后台启动。'));
							});
						})
					}, dataStatus.update_running ? '正在更新…' : '更新数据集')
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
						E('h3', {}, '内网主机'),
						E('div', { 'class': 'ofi-panel-hint' }, '按 IP 地址固定排序；点击一行查看该主机的当前连接')
					]),
					E('span', { 'class': 'ofi-subtle' }, hosts.length + ' 台已记录')
				]),
				table(
					[ '主机', '实时下载', '实时上传', '累计下载', '累计上传', '连接', '风险' ],
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
						E('h3', {}, '当前连接 · ' + text(selectedHost.hostname, '未命名主机')),
						E('div', { 'class': 'ofi-panel-hint ofi-mono' },
							selectedHost.ip + (selectedHost.mac ? ' · ' + selectedHost.mac : ''))
					]),
					E('span', { 'class': 'ofi-subtle' }, selectedFlows.length + ' 条活动连接')
				]),
				E('div', { 'class': 'ofi-detail-summary' }, [
					E('span', {}, [ '实时下载 ', E('strong', { 'class': 'ofi-down' }, rate(selectedHost.download_bps)) ]),
					E('span', {}, [ '实时上传 ', E('strong', { 'class': 'ofi-up' }, rate(selectedHost.upload_bps)) ]),
					E('span', {}, '累计下载 ' + bytes(selectedHost.downloaded)),
					E('span', {}, '累计上传 ' + bytes(selectedHost.uploaded))
				]),
				table(
					[ '方向', '源 IP', '', '目标 IP', '归属 / ASN', '下载', '上传', '风险' ],
					flowRows(selectedFlows, '该主机当前没有活动连接'),
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
					E('h3', {}, '实时带宽趋势'),
					E('span', { 'class': 'ofi-subtle' }, '最近约 10 分钟')
				]),
				sparkline(data.history)
			]);
		}
		content.push(
			E('div', { 'class': 'ofi-stats' }, [
				stat('当前下载', rate(totals.download_bps), 'down'),
				stat('当前上传', rate(totals.upload_bps), 'up'),
				stat('累计下载', bytes(totals.downloaded)),
				stat('累计上传', bytes(totals.uploaded)),
				stat('活动主机 / 连接', (totals.active_hosts || 0) + ' / ' + (totals.active_flows || 0)),
				stat('当前最高风险', String(totals.highest_risk || 0), riskClass(totals.highest_risk || 0))
			]),
			E('div', { 'class': 'ofi-workspace' }, [
				E('div', {
					'class': 'ofi-tabs',
					'role': 'tablist',
					'aria-label': '流量洞察栏目'
				}, [
					tabButton('trend', '实时趋势', this.activeTab === 'trend', false, selectTab),
					tabButton('hosts', [
						'内网主机',
						E('span', { 'class': 'ofi-tab-count' }, String(hosts.length))
					], this.activeTab === 'hosts', false, selectTab),
					tabButton('connections', [
						'当前连接',
						selectedHost ? E('span', { 'class': 'ofi-tab-count' }, String(selectedFlows.length)) : ''
					], this.activeTab === 'connections', !selectedHost, selectTab)
				]),
				activePanel
			]),
			E('section', { 'class': 'ofi-footnote' }, [
				E('strong', {}, '风险评分说明：'),
				'0 分表示未在已加载数据集中观察到，不代表安全。评分以最高严重证据为基准，每个额外独立来源增加 5 分，封顶 100；仅用于排查优先级，不会自动封禁 IP。',
				E('br'),
				'数据更新时间：' + updated + '；归属地为国家/地区与 ASN 级别，所有查询均在路由器本地完成。'
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
