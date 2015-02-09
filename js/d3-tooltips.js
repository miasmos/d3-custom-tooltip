/*
	Battle.net/Diablo III Tooltip Script

	Changelog:
	v1.1
		- Added support for follower skills
*/

if(typeof Bnet == 'undefined') var Bnet = {};
if(typeof Bnet.D3 == 'undefined') Bnet.D3 = {};

if(typeof Bnet.D3.Tooltips == 'undefined') Bnet.D3.Tooltips = new function() { // Reminder: Keep in sync with the equivalent code in d3.js

	var URL_CSS = 'http://{region}.battle.net/d3/static/css/';
	//var URL_QUERY_BASE = 'http://{region}.battle.net/d3/{locale}/tooltip/';
	var URL_QUERY_BASE = 'http://{region}.battle.net/api/d3/data/item/';

	var TYPES = {
		item: {
			type: 'item',
			url: '{key}?'
		},
		recipe: {
			type: 'recipe',
			url: 'recipe/{key}?'
		},
		skill: {
			type: 'skill',
			url: 'skill/{folder}/{key}?runeType={queryParam}'
		},
		calculator: {
			type: 'calculator',
			url: 'calculator/{folder}/{key}?'
		}
	};

	/*
		Extract (region), (locale), and (rest) of the URL

		{region}.battle.net/d3/{locale}/{rest}
	*/
	var URL_PATTERN_BASE = new RegExp('^http://([a-z]{2})\\.battle\\.net/d3/([a-z]{2})/(.+)');
	var URL_PATTERN_SELF = new RegExp('([a-z]{2})\\.battle\\.net/d3/static/js/tooltips\\.js'); // Used to get region from the <script> tag

	/*
		Each regex below extracts a (folder) and (key).
	*/
	var URL_PATTERNS = [
		/*
		Notes:
			- Using [^#\\?]+ below to ignore URL parameters or hashes
		*/

		// item/{itemSlug}
		{
			regex: new RegExp('^item/()([^#\\?]+)$'),
			params: {
				type: 'item'
			}
		},
		// artisan/{artisanSlug}/recipe/{recipeSlug}
		{
			regex: new RegExp('^artisan/([^/]+)/recipe/([^#\\?]+)$'),
			params: {
				type: 'recipe'
			}
		},
		// class/{classSlug}/active/{skillSlug}?runeType={runeType}
		{
			regex: new RegExp('^class/([^/]+)/active/([^#\\?]+)\\?runeType=([a-z])$'),
			params: {
				type: 'skill'
			}
		},
		// class/{classSlug}/passive/{skillSlug}
		{
			regex: new RegExp('^class/([^/]+)/passive/([^#\\?]+)$'),
			params: {
				type: 'skill'
			}
		},
		// follower/{followerSlug}/skill/{skillSlug}
		{
			regex: new RegExp('^follower/([^/]+)/skill/([^#]+)'),
			params: {
				type: 'skill'
			}
		},
		// calculator/{classSlug}#{build}
		{
			regex: new RegExp('^calculator/([^#]+)[#/](.+)'),
			params: {
				type: 'calculator'
			}
		}
	];

	var DELAY_LOADING = 500; // ms
	var dataCache = {};

	// State
	var loadingTimer;
	var currentLink;
	var currentParams;



	function construct() {
		$.documentReady(initialize);
	}

	function initialize() {
		setTimeout(getCss, 1);
		setTimeout(bindEvents, 1);

		var params = parseParams();
		if ('item' in params) {
			var a = document.getElementById("static-innerLink");
			var al = replaceAll(' ','-',decodeURI(params.item));
			al = replaceAll('\'','',al);
			a.setAttribute("data-d3tooltip",al);
			linkMouseOver(1,a);
		}
	}

	function getCss() {

		// Grab the region from the script URL
		var scripts = document.getElementsByTagName('script');
		var currentScript = scripts[scripts.length - 1];
		var scriptRegion;

		if(currentScript && currentScript.src.match(URL_PATTERN_SELF)) {
			scriptRegion = RegExp.$1;
		}

		var cssUrl = URL_CSS.replace('{region}', scriptRegion || 'us');

		$.getStyle(cssUrl + 'tooltips.css');
		if($.Browser.ie6) {
			$.getStyle(cssUrl + 'tooltips-ie6.css');
		}
	}

	function bindEvents() {

		$.bindEvent(document, 'mouseover', function(e) {
			var link = getLinkFromEvent(e);
			if(link) {
				linkMouseOver(0,link);
			}
		});

		$.bindEvent(document, 'mouseout', function(e) {

			var link = getLinkFromEvent(e);
			if(link) {
				linkMouseOut(link);
			}
		});
	}

	function parseParams(val) {
	    var queryDict = {}
		location.search.substr(1).split("&").forEach(function(item) {queryDict[item.split("=")[0]] = item.split("=")[1]});
		return queryDict;
	}

	function getLinkFromEvent(e) {

		e = $.normalizeEvent(e);

		var target = e.target;
		var tries = 0;

		while(target && ++tries <= 5) {

			if(target.nodeName.toUpperCase() == 'A') {
				return target;
			}
			target = target.parentNode;
		}

		return null;
	}

	function linkMouseOver(static,link) {
		var params = {};

		parseUrl(link, params);
		parseOptions(link, params);

		if(!params.key || currentLink == link) {
			return;
		}

		currentLink = link;
		currentParams = params;

		var data = getTooltip(params);
		if(data != null) {
			if (static) showStaticTooltip(data);
			else showTooltip(data);
		}
	}

	function linkMouseOut(link) {

		if(link != currentLink) {
			return;
		}

		Tooltip.hide();

		currentLink = null;
		currentParams = null;
	}

	function parseUrl(link, params) {

		var d3tooltip = link.getAttribute('data-d3tooltip');
		if ('undefined' != typeof d3tooltip && d3tooltip) {
			params.region = 'us';
			params.locale = 'en';
			params.folder = null;
			params.key = d3tooltip;
			params.queryParam = null;
			params.type = 'item';
			params.tooltipType = getTooltipType(params.type);
			return;
		}

		if(!link.href.match(URL_PATTERN_BASE)) {
			return;
		}

		var region = RegExp.$1;
		var locale = RegExp.$2;

		var rest = RegExp.$3;

		for(var i = 0; i < URL_PATTERNS.length; ++i) {

			var urlPattern = URL_PATTERNS[i];

			if(!rest.match(urlPattern.regex)) {
				continue;
			}

			var folder = RegExp.$1;
			var key = RegExp.$2;
			var queryParam = RegExp.$3;

			if(folder.indexOf('/') != -1 || key.indexOf('/') != -1) { // Folder and key shouldn't contain any slashes
				continue;
			}

			params.region = region;
			params.locale = locale;
			params.folder = folder;
			params.key = key;
			params.queryParam = queryParam;

			// Copy pattern's params
			for(var i in urlPattern.params) {
				params[i] = urlPattern.params[i];
			}

			params.tooltipType = getTooltipType(params.type);
			return;
		}
	}

	function parseOptions(link, params) {

		// TBD

	}

	function requestTooltip(params) {

		var url = (URL_QUERY_BASE + params.tooltipType.url)
			.replace('{region}', params.region)
			.replace('{locale}', params.locale)
			.replace('{folder}', params.folder)
			.replace('{key}',    params.key)
			.replace('{queryParam}',   params.queryParam);

		$.getScript(url + '&format=jsonp');
	}

	function registerData(data) {

		clearTimeout(loadingTimer);

		var params = data.params;
		if ('item' == params.type)
			params.key = currentLink.getAttribute('data-d3tooltip');
		saveData(params, data);
		if(currentParams != null && getCacheKeyFromParams(params) == getCacheKeyFromParams(currentParams) ) {
			showStaticTooltip(data);
		}
	}

	function getTooltip(params) {

		var data = loadData(params);

		if(data == null) { // Fetch data if not already cached

			clearTimeout(loadingTimer);
			loadingTimer = setTimeout(showLoading, DELAY_LOADING);
			requestTooltip(params);
			return null;
		}

		return data;
	}

	function showLoading() {

		if(currentLink != null) {
			Tooltip.show(currentLink, '<div class="d3-tooltip"><div class="loading"></div></div>');
		}
	}

	function showTooltip(data) {

		if(currentLink != null) {
			Tooltip.show(currentLink, data.tooltipHtml);
		}
	}

	function showStaticTooltip(data) {

		if(currentLink != null) {
			Tooltip.showStatic(data.tooltipHtml);
		}
	}

	// Utilities
	function getTooltipType(type) {
		return TYPES[type];
	}

	function saveData(params, data) {

		var cacheKey = getCacheKeyFromParams(params);
		dataCache[cacheKey] = data;
	}

	function loadData(params) {

		var cacheKey = getCacheKeyFromParams(params);
		return dataCache[cacheKey];
	}

	function getCacheKeyFromParams(params) {
		if ('item' == params.type)
			return params.key;
		else
			return [
				params.region,
				params.locale,
				params.type,
				params.key
			].join('-');
	}

	function replaceAll(find, replace, str) {
  		return str.replace(new RegExp(find, 'g'), replace);
	}
	// Public methods
	this.registerData = registerData;

	//HTML constructor
	if(typeof Bnet.D3.TooltipConstructor == 'undefined') Bnet.D3.TooltipConstructor = new function() {
		var html;
		var mediaPrefixLarge = "http://media.blizzard.com/d3/icons/items/large/";
		var mediaPrefixSmall = "http://media.blizzard.com/d3/icons/items/small/";

		this.Get = function(data) {
			console.dir(data);

			var type = data.tooltipParams.substring(0, data.tooltipParams.indexOf('/'));
			var name = data.tooltipParams.substring(data.tooltipParams.indexOf('/')+1, data.tooltipParams.length+1);
			return "Bnet.D3.Tooltips.registerData({ params: { region: 'us', locale: 'en', type: '" + type + "', key: '" + name + "'}, tooltipHtml: '" + this.Construct(data) + "'});"
		}

		this.Construct = function(data) {
			html = "";
			div(1,["d3-tooltip-wrapper"]);
				div(1,["d3-tooltip-wrapper-inner"]);
					div(1,["d3-tooltip","d3-tooltip-item"]);
						div(1,["tooltip-head","tooltip-head-"+data.displayColor]);
							h3(1,["d3-color-"+data.displayColor]);
								html += data.name.replace("'","&#39;");
							h3(0);
						div(0);
						div(1,["tooltip-body","effect-bg","effect-bg-" + isArmor(data) ? "armor" : "weapon","effect-bg-" + isArmor(data) ? "armor" : "weapon" + "-" + getIconSize(data.type.id.toLowerCase())]);
							span(1,["d3-icon","d3-icon-item","d3-icon-item-large","d3-icon-item-"+data.displayColor]);
							span(1,["icon-item-gradient"]);
							span(1,["icon-item-inner","icon-item-"+getIconSize(data.type.id.toLowerCase())],["background-image: url("+mediaPrefixLarge+data.icon+".png)"]);
							span(0);
							span(0);
							span(0);
							div(1,["d3-item-properties"]);
								ul(1,["item-type-right"]);
									li(1,["item-slot"]);
										var slot = getSlot(data.slots);
										if (slot == "-Hand") {
											html += data.type.twoHanded ? "2"+slot : "1"+slot;
										} else {
											html += slot;
										}
									li(0);
								ul(0);
								ul(1,["item-type"]);
									li(1);
										span(1,["d3-color-"+data.displayColor]);
											html += data.typeName;
										span(0);
									li(0);
								ul(0);
								if (data.armor || data.dps) {
									var node = data.armor || data.dps;
									ul(1,["item-armor-weapon","item-armor-armor"]);
										li(1,["big"]);
											p(1);
												span(1,["value"]);
													var dps = (Math.round(node.min * 10) / 10).toString()
													html += dps.length == 3 ? dps + "0" : dps;
												span(0);
											p(0);
										li(0);
										li(1);
											html += data.armor ? "Armor" : "Damage Per Second";
										li(0);
									ul(0);

									if (data.dps) {
										ul(1,["item-armor-weapon","item-weapon-damage"]);
											li(1);
												p(1);
													span(1,["value"]);
														html += Math.round(data.minDamage.min);
													span(0);
													html += "–";
													span(1,["value"]);
														html += Math.round(data.maxDamage.max);
													span(0);
													span(1,["d3-color-FF888888"]);
														html += " Damage";
													span(0);
												p(0);
											li(0);
											li(1);
												p(1);
													span(1,["value"]);
														var aps = (Math.round(data.attacksPerSecond.min * 100) / 100).toString();
														html += aps.length == 3 ? aps + "0" : aps ;
													span(0);
													span(1,["d3-color-FF888888"]);
														html += " Attacks Per Second";
													span(0);
												p(0);
											li(0);
										ul(0);										
									}
								}

								div(1,["item-before-effects"]);
								div(0);

								ul(1,["item-effects"]);
									parseAttributes(data.attributes.primary,"Primary");
									parseAttributes(data.attributes.secondary,"Secondary");
									parseAttributes(data.attributes.passive,"Passive");
								ul(0);

								if (data.set) {
									ul(1,["item-itemset"]);
										li(1,["item-itemset-name"]);
											span(1,["d3-color-green"]);
												html += data.set.name;
											span(0);
										li(0);
										for (var item in data.set.items) {
											li(1,["item-itemset-piece","indent"]);
												data.tooltipParams == data.set.items[item].tooltipParams ? span(1,["d3-color-white"]) : span(1,["d3-color-gray"]);
												//span(1,["d3-color-"+data.set.items[item].displayColor]);
													html += data.set.items[item].name;
												span(0);
											li(0);
										}
										for (var rank in data.set.ranks) {
											li(1,["item-itemset-bonus-amount","d3-color-gray"]);
											//li(1,["item-itemset-bonus-amount","d3-color-"+data.set.ranks[rank].attributes.passive[0].color]);
												html += "("; 
												span(1,["value"]);
													html += data.set.ranks[rank].required;
												span(0);
												html += ") Set:"
											li(0);
											parseSetAttributes(data.set.ranks[rank].attributes.primary);
											parseSetAttributes(data.set.ranks[rank].attributes.secondary);
											parseSetAttributes(data.set.ranks[rank].attributes.passive);
										}
									ul(0);
								}

								if (data.requiredLevel || data.accountBound) {
									ul(1,["item-extras"]);
									if (data.requiredLevel) {
										li(1,["item-reqlevel"]);
											span(1,["d3-color-gold"]);
												html += "Required level: ";
											span(0);
											span(1,["value"]);
												html += data.requiredLevel;
											span(0);
										li(0);
									}
									if (data.accountBound) {
										li(1);
											html += "Account Bound";
										li(0);
									}
									ul(0);
								}
								if (data.displayColor == "orange" || data.displayColor == "green") {
									span(1,["item-unique-equipped"]);
										html += "Unique Equipped";
									span(0);		
								}
								span(1,["clear"]);
									html += "<!-- -->";
								span(0);
							div(0);
						div(0);

						if (data.flavorText) {
							div(1,["tooltip-extension"]);
								div(1,["flavor"]);
									html += replaceAll('\'', '\\\'', data.flavorText);
								div(0);
							div(0);
						}
					div(0);
				div(0);
			div(0);

			return html;
		}

		function parseAttributes(node,name) {
			if (node.length > 0) {
				p(1,["item-property-category"]);
					html += name;
				p(0);
				li(1,[],["list-style:none","display:inline"]);
					for (var e in node) {
						if (typeof node[e] === 'undefined') continue;
						li(1,["d3-color-"+node[e].color,"d3-item-property-"+node[e].affixType]);
							p(1);
								html += node[e].text.replace(/(\+?\d+.\d+%?|\+?\d+%?)/g, "<span class=\"value\">$1</span>");
							p(0);
						li(0);
					}
				li(0);
			}
		}

		function parseSetAttributes(node) {
			if (node.length > 0) {
				for (var n in node) {
					li(1,["d3-color-gray","item-itemset-bonus-desc","indent"]);
					//li(1,["d3-color-"+node[n].color,"item-itemset-bonus-desc","indent"]);
						html += node[n].text.replace(/(\+?\d+.\d+%?|\+?\d+%?)/g, "<span class=\"value\">$1</span>");
					li(0);
				}
			}
		}

		function div(state,classes,style) {state == 1 ? startTag("div",classes,style) : endTag("div");}
		function span(state,classes,style) {state == 1 ? startTag("span",classes,style) : endTag("span");}
		function ul(state,classes) {state == 1 ? startTag("ul",classes) : endTag("ul");}
		function li(state,classes) {state == 1 ? startTag("li",classes) : endTag("li");}
		function h3(state,classes) {state == 1 ? startTag("h3",classes) : endTag("h3");}
		function p(state,classes) {state == 1 ? startTag("p",classes) : endTag("p");}

		function startTag(tag,classes,style) {
			var t = "<" + tag;
			if (typeof classes !== 'undefined') {
				if (classes.length > 0) t += " class=\""
				for (var c in classes) {if (typeof classes[c] !== 'undefined') t += classes[c] + " ";}
				if (classes.length > 0) t += "\"";
			}
			if (typeof style !== 'undefined') {
				if (style.length > 0) t += " style=\""
				for (var c in classes) {if (typeof style[c] !== 'undefined') t += style[c] + ";";}
				if (style.length > 0) t += "\"";
			}
			t += ">";
			html += t;
		}

		function endTag(tag) {
			html += "</" + tag + ">";
		}

		function getSlot(slots) {
			var slot = slots[0].toLowerCase();
			if (slot.indexOf("finger") > -1) return "Finger";
			else if (slot.indexOf("shoulder") > -1) return "Shoulder";
			else if (slot.indexOf("wrist") > -1) return "Wrists";
			else if (slot.indexOf("feet") > -1) return "Feet";
			else if (slot.indexOf("leg") > -1) return "Legs";
			else if (slot.indexOf("chest") > -1) return "Chest";
			else if (slot.indexOf("head") > -1) return "Head";
			else if (slot.indexOf("waist") > -1) return "Waist";
			else if (slot.indexOf("hands") > -1) return "Hands";
			else if (slot.indexOf("right-hand") > -1) return "Off-Hand";
			else if (slot.indexOf("-hand") > -1) return "-Hand";
			else if (slot.indexOf("neck") > -1) return "Neck";
			else return "";
		}

		function getIconSize(type) {
			if (type.indexOf("ring") > -1 || type.indexOf("belt") > -1 || type.indexOf("amulet") > -1) return "square";
			return "default";
		}

		function isArmor(node) {
			return node.dps ? false : true;
		}
	}

	// HTML Helpers
	var $ = {

		create: function(nodeName) {
			return document.createElement(nodeName);
		},

		getScript: function(url) {
			var script = $.create('script');
			script.type = 'text/javascript';

	    	if (window.XMLHttpRequest) {
	        	xmlhttp = new XMLHttpRequest();
		    } else {
		        // code for IE6, IE5
		        xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
		    }  

		    xmlhttp.onreadystatechange = function() {
		        if (xmlhttp.readyState == 4 ) {
		           if(xmlhttp.status == 200 || xmlhttp.status == 0) {
		           		var scriptText = Bnet.D3.TooltipConstructor.Get(JSON.parse(xmlhttp.responseText));
		           		script.text = scriptText;
		                document.body.appendChild(script);
		           }
		        }
		    }

		    xmlhttp.open("GET", 'item.php?url='+url, true);
		    xmlhttp.send();
		},

		getStyle: function(url) {

			var link = $.create('link');
			link.rel = 'stylesheet';
			link.type = 'text/css';
			link.href = url;

			document.body.appendChild(link);
		},

		documentReady: function(callback) {

			if(document.readyState == 'complete') {
				callback();
				return;
			}

			var occurred = false;

			$.bindEvent(document, 'DOMContentLoaded', function() {

				if(!occurred) {
					occurred = true;
					callback();
				}
			});

			$.bindEvent(document, 'readystatechange', function() {

				if(document.readyState == 'complete' && !occurred) {
					occurred = true;
					callback();
				}
			});

		},

		bindEvent: function(node, eventType, callback) {
			if(node.addEventListener) {
				node.addEventListener(eventType, callback, true); // Must be true to work in Opera
			} else {
				node.attachEvent('on' + eventType, callback);
			}
		},

		normalizeEvent: function(e) {
			var ev = {};
			ev.target = (e.target ? e.target : e.srcElement);
			ev.which = (e.which ? e.which : e.button);
			return ev;
		},

		getWindowSize: function() {

			var w = 0;
			var h = 0;

			if(document.documentElement && document.documentElement.clientHeight) {
				w = document.documentElement.clientWidth;
				h = document.documentElement.clientHeight;
			} else if (document.body && document.body.clientHeight) {
				w = document.body.clientWidth;
				h = document.body.clientHeight;
			} else if(window.innerHeight) {
				w = window.innerWidth;
				h = window.innerHeight;
			}

			return {
				w: w,
				h: h
			};
		},

		getScrollPosition: function () {

			var x = 0;
			var y = 0;

			if(window.pageXOffset || window.pageYOffset) {
				x = window.pageXOffset;
				y = window.pageYOffset;
			} else if(document.body && (document.body.scrollLeft || document.body.scrollTop)) {
				x = document.body.scrollLeft;
				y = document.body.scrollTop;
			} else if(document.documentElement && (document.documentElement.scrollLeft || document.documentElement.scrollTop)) {
				x = document.documentElement.scrollLeft;
				y = document.documentElement.scrollTop;
			}

			return {
				x: x,
				y: y
			};
		},

		getOffset: function(node) {

			var x = 0;
			var y = 0;

			while(node) {
				x += node.offsetLeft;
				y += node.offsetTop;

				var p = node.parentNode;

				while(p && p != node.offsetParent && p.offsetParent) {
					if(p.scrollLeft || p.scrollTop) {
						x -= (p.scrollLeft | 0);
						y -= (p.scrollTop | 0);
						break;
					}
					p = p.parentNode;
				}
				node = node.offsetParent;
			}

			return {
				x: x,
				y: y
			};
		},

		getViewport: function() {
			var windowSize = $.getWindowSize();
			var scroll = $.getScrollPosition();

			return {
				l: scroll.x,
				t: scroll.y,
				r: scroll.x + windowSize.w,
				b: scroll.y + windowSize.h
			};
		}
	}

	$.Browser = {};
	$.Browser.ie = !!(window.attachEvent && !window.opera);
	$.Browser.ie6 = $.Browser.ie && navigator.userAgent.indexOf("MSIE 6.0") != -1;



	// Helper class that handles displaying tooltips
	var Tooltip = new function() {

		var PADDING = 5;

		var tooltipWrapper;
		var tooltipContent;

		function initialize() {

			tooltipWrapper = $.create('div');
			tooltipWrapper.className = 'd3-tooltip-wrapper';

			tooltipContent = $.create('div');
			tooltipContent.className = 'd3-tooltip-wrapper-inner';

			tooltipWrapper.appendChild(tooltipContent);
			document.body.appendChild(tooltipWrapper);

			hide();
		}

		function show(node, html) {

			if(tooltipWrapper == null) {
				initialize();
			}

			tooltipWrapper.style.visibility = 'hidden';
			tooltipWrapper.style.display = 'block';
			tooltipContent.innerHTML = html;

			var viewport = $.getViewport();
			var offset = $.getOffset(node);

			var x = offset.x + node.offsetWidth + PADDING;
			var y = offset.y - tooltipWrapper.offsetHeight - PADDING;

			if(y < viewport.t) {
				y = viewport.t;
			}

			if(x + tooltipWrapper.offsetWidth > viewport.r) {
				x = offset.x - tooltipWrapper.offsetWidth - PADDING;
			}

			reveal(x, y);
		}

		this.showStatic = function(html) {
			var node = document.getElementById("static-innerLink");
			if(tooltipWrapper == null) {
			initialize();
			}

			tooltipWrapper.style.visibility = 'hidden';
			tooltipWrapper.style.display = 'block';
			tooltipContent.innerHTML = html;

			reveal(0,0);
		}

		function hide() {

			if(tooltipWrapper == null) {
				return;
			}

			tooltipWrapper.style.display = 'none';
		}

		function reveal(x, y) {

			tooltipWrapper.style.left = x + 'px';
			tooltipWrapper.style.top  = y + 'px';

			tooltipWrapper.style.visibility = 'visible';
		}

		// Public methods
		this.show = show;
		this.hide = hide;

	};

	construct();

};
