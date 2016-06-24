var Slack = require('slack-client');
var fs = require('fs');
var token = require('./token.json');
var async = require('async');
var price = require('./fetch_price');
var sharebill = require('./sharebill');
var _ = require('underscore');
var sendOrder = require('./send_order');
var request = require('request');
var rational = require('big-rational');

var DELIVERY_COST = 75;

var aliases;
fs.readFile(__dirname + "/aliases.json", 'utf8', function(e, datas) {
  if (e) {
    fs.writeFileSync(__dirname + "/aliases.json", "{}");
    aliases = {};
    return;
  }
  aliases = JSON.parse(datas);
});

var slack = new Slack(token, true, true);

var order = undefined;
var orderPendingConfirm = undefined;

slack.on('message', function(message) {
  if (!message.text) return;
  var commandMatcher = /^([fm]\w{2,4}[sk]!|helge!|![fm]\w{2,4}[sk]|!iamold)\s+(\w+)\s*(.*)$/i;
  if (!message.text.match(commandMatcher)) return;
  var channel = slack.getChannelGroupOrDMByID(message.channel);
  var grp = message.text.match(commandMatcher, '');
  if (!grp) return channel.send(':joearmcat:');
  var cmd = grp[2] && grp[2].toLowerCase()
  if (!cmd || !handlers[cmd]) {
    channel.send('unsupported command! try one of these: ' + Object.keys(handlers).join(', '));
  } else {
    handlers[cmd](channel, message, grp[3]);
  }
});

slack.on('error', function(err) {
  console.log('got error', err);
});

function saveorder() {
  if (!order) return;
    var fn = order.id + ".json";
  fs.writeFileSync(fn, JSON.stringify(order));
}

var handlers = {
  openorder: function(channel, message, args) {
    if (order != null) {
      return channel.send("there's already an open order. close it first with 'fisk! closeorder'");
    }
    order = {orders:[],id: "order_" + Date.now()};
    channel.send('opened a new order on ' + order.id + '.json');
    saveorder();
  },
  order: function(channel, message, args) {
    if (!message.user) return;
    var user = slack.getUserByID(message.user);
    if (!user) return;
    createOrder(channel, message, user.name, args);
  },
  orderfor: function(channel, message, args) {
    var split = args.split(' ');
    var user = split[0];
    createOrder(channel, message, user, split.slice(1).join(' '));
  },
  nettbestilling : function(channel, message, args) {
    channel.send('usage: fisk! sendorder <mobile number>');
  },
  rawsummary: function(channel, message, args) {
    if (order == null) return channel.send("there's no open order. open one with 'fisk! openorder'");
    channel.send(order.orders.map(function(order) {
      return order.user + ": " + order.text;
    }).join('\n'));
  },
  closeorder: function(channel, message) {
    if (order == null) return channel.send("there's no open order.");
    saveorder();
    channel.send("closed order and stashed it as " + order.id + ".json");
    order = undefined;
  },
  alias: function(channel, message, args) {
    args = args.split(' ');
    if (args.length != 2) return channel.send("usage: fisk! alias <username> <alias>");
    aliases[args[0]] = args[1];
    fs.writeFileSync(__dirname + "/aliases.json", JSON.stringify(aliases));
    channel.send('`' + [].join.call(JSON.stringify(aliases),'\u200B') + '`')
  },
  replace: function(channel, message, args) {
    if (!message.user) return;
    var user = slack.getUserByID(message.user);
    if (!user) return;
    changeOrder(channel, message, user.name, args);
  },
  search: function(channel, message, args) {
    if (!args) return channel.send("usage: fisk! search <term>");
    price.searchMatches(args, function(e, result) {
      if (e || result.length == 0) return channel.send("no matches")
      channel.send(result.map(function(item) {
        return item.name + ' (' + item.price + 'kr)'
      }).join('\n'))
    });
  },
  match: function(channel, message, args) {
    if (!args) return channel.send("usage: fisk! match <term>");
    price.bestMatch(args, function(e, result) {
      if (e || result == null) return channel.send("no matches")
      channel.send("matched: \"" + result.name + "\" (price: " + result.price + "kr, distance: " + result.distance.toFixed(2) +")")
    });
  },
  remove: function(channel, message, args) {
    if (!message.user && !args) return channel.send("hæ?!");
    if (order == null) return channel.send("i don't see any open order bro");
    if (!args) {
      var user = slack.getUserByID(message.user);
      args = user.name;
    }
    var count = order.orders.length;
    order.orders = order.orders.filter(function(order) {
      return order.user != args;
    });
    var newCount = order.orders.length;
    channel.send("removed " + (count-newCount) + " orders matching '" + args + "'");
    saveorder();
  },
  sendorder: function(channel, message, args) {
    if (order == null) return channel.send("there is no open order... :/");
    if (!args) return channel.send("usage: fisk! sendorder <mobile number>");
    var mobileNumber = args.replace(/[^\d]/g, '');
    if (!mobileNumber || mobileNumber.length != 8) return channel.send(args + " doesn't look like a valid mobile number to me");
    orderPendingConfirm = { order: order, mobile: mobileNumber };
    setTimeout(function() {
      orderPendingConfirm = undefined;
    }, 10000); 
    channel.send("please use 'fisk! confirmsend' within 10 seconds to send this order to iSushi");
  },
  cookie: function(channel, message, args) {
    if (order == null) return channel.send("with what? no one has ordered anything. there's not even an open order.");
    if (!args) return channel.send("usage: fisk! cookie <mobile number>");
    var mobileNumber = args.replace(/[^\d]/g, '');
    if (!mobileNumber || mobileNumber.length != 8) return channel.send(args + " doesn't look like a valid mobile number to me");
    sendOrder.createCookie(order, mobileNumber, function(err, cookie) {
      if (err) return channel.send("something broke: " + err);
      else channel.send("```\n" + cookie + "\n```");
    });
  },
  confirmsend: function(channel, message, args) {
    if (order == null) return channel.send("there's no open order!");
    if (!orderPendingConfirm) return channel.send("there's no order pending confirmation right now");
    sendOrder.makeOrder(orderPendingConfirm.order, orderPendingConfirm.mobile, function(err, response) {
      if (err) {
        console.log(err);
        return channel.send("order post to store failed: " + require('util').inspect(err));
      }

      console.log(response);
      channel.send("order sent to isushi. confirmation here: " + response.url + "\ncookie required to view page: " + response.cookie);
      setTimeout(function() {
        handlers.suggestpayer(channel, message);
      }, 1000);
    });
    orderPendingConfirm = undefined;
  },
  suggestpayer: function(channel, message, args) {
    if (order == null) return channel.send("ain't no open order");
    var orderSharebillers = order.orders.map(function(orderline) {
      return aliases[orderline.user];
    });
    request('http://sharebill.qpgc.org/balances', function(err, response, body) {
      if (err) return channel.send('err receiving sharebill balances: ' + require('util').inspect(err));
      channel.send('candidates for paying: ' + _.chain(JSON.parse(body).rows).map(function(balance) {
        return { key: balance.key, value: rational(balance.value).valueOf() }
      }).select(function(balance) {
        return !!~orderSharebillers.indexOf(balance.key);
      }).sortBy(function(balance) {
        return balance.value;
      }).take(3).map(function(balance) {
        return balance.key + ' (' + balance.value.toFixed(0) + ')'
      }).value().join(', '));
    });
  },
  summary: function(channel, message, args) {
    if (order == null) return channel.send("i don't see any open order bro");
    async.map(order.orders, function(order, cb) {
      price.fetchMatchesForOrder(order.text, function(e, matches) {
        if (e) return cb(e);
        else cb(null, {matches: matches, user:order.user});
      });
    }, function(e, orders) {
      if (e) return channel.send('something broke when finding prices. ' + e);
      var totalPrice = 0;
      var found = orders.map(function(o) {
        var total = o.matches.reduce(function(t, o) { return t + o.price; }, 0) + (DELIVERY_COST/order.orders.length);
        totalPrice += total;
        return o.user[0] + '\u200B' + o.user.slice(1) + ": " + total.toFixed(0) + "kr | " + o.matches.map(function(match) {
          return match.name + ' @ ' + match.price + 'kr';
        }).join(' + ') + " + " + (DELIVERY_COST / order.orders.length).toFixed(1) + "kr delivery";
      }).join('\n');
      var total = "Total: " + totalPrice.toFixed(0) + 'kr';
      var messageText = "ok, here's what those orders looked like to me:\n" + found + '\n' + total;
      channel.send(messageText);
    });
  },
  sharebill: function(channel, message, args) {
    if (order == null) return channel.send("i don't see any open order bro");
    if (!args) return channel.send('usage: fisk! sharebill <payer id>');
    async.map(order.orders, function(order, cb) {
      price.fetchMatchesForOrder(order.text, function(e, matches) {
        if (e) return cb(e);
        else cb(null, {matches: matches, user:order.user});
      });
    }, function(e, orders) {
      if (e) return channel.send('something broke when finding prices. ' + e);
      if (!orders || orders.length === 0) {
        return channel.send('No orders to sharebill.');
      }

      var totalPrice = DELIVERY_COST;
      var accounts = {};
      var accountOccurances = {};
      orders.forEach(function(o, i) {
        var total = o.matches.reduce(function(t, o) { return t + o.price; }, 0);
        var alias = aliases[o.user] || o.user;
        totalPrice += total;
        accountOccurances[alias] = accountOccurances[alias] ? accountOccurances[alias] + 1 : 1;
        accounts[alias] = accounts[alias] ? accounts[alias] + total : total;
      });

      // Total is simply built as a string to preserve the fraction.
      Object.keys(accounts).forEach(function(key, idx) {
        accounts[key] = '' + accounts[key] + ' '+ (DELIVERY_COST * accountOccurances[key])+'/'+order.orders.length;
      });

      return sharebill(accounts, totalPrice, args, function(error, result) {
        if (error) {
          return channel.send(error);
        }
        handlers.closeorder(channel, message);
        return channel.send('Posted to sharebill '+result);
      });
    });
  },
  load: function(channel, message, args) {
    if (order != null) return channel.send("there's an order open already. close if it first");
    var exists = fs.existsSync(__dirname + '/' + args);
    if (!exists) {
      var query = parseInt(args);
      if (isNaN(args) || args >= 1) return channel.send("couldn't find file " + args);

      var files = fs.readdirSync(__dirname);
      files = files.filter(function(f) { return !!f.match(/^order_\d+\.json/) }).sort().reverse();
      args = files[Math.abs(query)];
      if (args == null) return channel.send("there are only " + files.length + " saved orders");
    }
    var file = fs.readFileSync(__dirname + '/' + args, 'utf8');
    var data;
    try {
      data = JSON.parse(file);
      if (!Array.isArray(data.orders)) throw "invalid file";
    } catch (e) {
      return channel.send("bad file: "+e);
    }

    order = data;
    handlers.summary(channel, message);
  },
  reorder: function(channel, message, args) {
    if (order == null) return channel.send("wat. no open order. open an order.");

    var files = fs.readdirSync(__dirname);
    files = files.filter(function(f) { return !!f.match(/^order_\d+\.json/) }).sort().reverse();

    function getFileOrders(file) {
      var fileData = fs.readFileSync(__dirname + '/' + args, 'utf8');
      var data;
      try {
        data = JSON.parse(fileData);
        if (!Array.isArray(data.orders)) throw "invalid file";
      } catch (e) {
        return channel.send("bad file: "+e);
      }
      return data ? data.orders : [];
    }

    var prevOrder;
    var orderIndex = 1;
    var user = slack.getUserByID(message.user);

    while (!prevOrder) {
      var orders = getFileOrders(files[orderIndex++]);
      var matchingOrders = orders.orders.filter(function(order) { order.user == user.name });
      if (matchingOrders.length > 0) prevOrder = matchingOrders[0];
    }

    if (!prevOrder) return channel.send("couldn't find a previous order from you");

    createOrder(channel, message, user.name, prevOrder.text);
  }
}

slack.on('error', function(err) { console.log(err); });

function createOrder(channel, message, user, text) {
  if (order == null) return channel.send("there's no open order. open one with 'fisk! openorder'");
  var didUpdateOrder = false;
  order.orders.forEach(function(order) {
    if (order.user == user) order.text += ", " + text;
    else return;
    // theoretically this will be synchronous and won't cause any problems. theoretically. hopefully. shit.
    price.fetchMatchesForOrder(text, function(e, matches) {
      var matchString = matches.map(function(m) { return m.name }).join(', ');
      channel.send("updated order for " + user + ": " + order.text + " (matched: " + matchString + ")");
    });
    didUpdateOrder = true;
  });
  if (didUpdateOrder) return saveorder();
  var newOrder = {user: user || "unnamed user", text: text};
  order.orders.push(newOrder);
  price.fetchMatchesForOrder(newOrder.text, function(e, matches) {
    var matchString = matches.map(function(m) { return m.name }).join(', ');
    channel.send("added an order for " + user + ": " + newOrder.text + " (matched: " + matchString + ")");
  });
  saveorder();
}

function changeOrder(channel, message, user, sub) {
  if (order == null) return channel.send("there's no open order. open one with 'fisk! openorder'");
  // so many things wrong with this but it works for simple stuff so ok.
  var submatch = sub.match(/s\/(.+[^\\])\/(.*[^\\])\//);
  if (!submatch) return channel.send("didn't understand replace syntax. try s/regex/replacement/");
  var matcher;
  try {
    matcher = new RegExp(submatch[1]);
  } catch(e) {
    return channel.send("bad regex: " + e);
  }

  var didFindAMatch = false;
  order.orders.forEach(function(order) {
    if (order.user != user) return;
    didFindAMatch = true;
    order.text = order.text.replace(matcher, submatch[2]);
    price.fetchMatchesForOrder(order.text, function(e, matches) {
      var matchString = matches.map(function(m) { return m.name }).join(', ');
      channel.send('order for ' + user + ' changed to: ' + order.text + " (matched: " + matchString + ")");
    });
  });
  if (!didFindAMatch) channel.send("didn't find an order for " + user + " to change");
  saveorder();
}


slack.login();
