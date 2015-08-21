var Slack = require('slack-client');
var fs = require('fs');
// var token = require('./token.json');
var async = require('async');
var price = require('./fetch_price');
//var n2f = require('num2fraction');

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

var slack = new Slack('xoxb-9491714853-gDfdv373yIyPqPo2jTsIRLUV', true, true);//token, true, true);

var order = undefined;

slack.on('message', function(message) {
  if (!message.text) return;
  if (!message.text.match(/^fisk!/)) return;
  var channel = slack.getChannelGroupOrDMByID(message.channel);
  var grp = message.text.match(/^fisk!\s+(\w+)\s*(.*)$/, '');
  if (!grp) return channel.send('dammit helge!');
  if (!grp[1] || !handlers[grp[1]]) {
    channel.send('unsupported command! try one of these: ' + Object.keys(handlers).join(', '));
  } else {
    handlers[grp[1]](channel, message, grp[2]);
  }
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
  summary: function(channel, message, args) {
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
    channel.send('`'+JSON.stringify(aliases)+'`')
  },
  replace: function(channel, message, args) {
    if (!message.user) return;
    var user = slack.getUserByID(message.user);
    if (!user) return;
    changeOrder(channel, message, user.name, args);
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
  pricecheck: function(channel, message, args) {
      //https://couch.qpgc.org/sharebill/_design/sharebill/_view/totals?group=true&group_level=1
    if (order == null) return channel.send("i don't see any open order bro");
    async.map(order.orders, function(order, cb) {
      price(order.text, function(e, matches) {
        if (e) return cb(e);
        else cb(null, {matches: matches, user:order.user});
      });
    }, function(e, orders) {
      if (e) return channel.send('something broke when finding prices. ' + e);
      var totalPrice = 0;
      var found = orders.map(function(o) {
        var total = o.matches.reduce(function(t, o) { return t + o.price }, 0) + (DELIVERY_COST/order.orders.length);
        totalPrice += total;
        return o.user + ": " + total.toFixed(0) + "kr (" + o.matches.map(function(match) {
          return match.name + '—' + match.price + 'kr';
        }).join(', ') + " + " + (DELIVERY_COST / order.orders.length).toFixed(1) + "kr delivery)";
      }).join('\n');
      var total = "total: " + totalPrice.toFixed(0) + 'kr';
      channel.send("ok, here's what those orders looked like to me:\n" + found + '\n' + total)
    });
  },
  sharebill: function(channel, message, args) {
    if (order == null) return channel.send("i don't see any open order bro");
    if (!args) return channel.send('usage: fisk! sharebill <payer id>');
    async.map(order.orders, function(order, cb) {
      price(order.text, function(e, matches) {
        if (e) return cb(e);
        else cb(null, {matches: matches, user:order.user});
      });
    }, function(e, orders) {
      if (e) return channel.send('something broke when finding prices. ' + e);
      var totalPrice = 0;
      var accounts= {};
      orders.forEach(function(o, i) {
        var total = o.matches.reduce(function(t, o) { return t + o.price; }, 0);
        var alias = aliases[o.user] || o.user;
        totalPrice += total;
        accounts[alias] = accounts[alias] ? accounts[alias] + total : total;
      });

      totalPrice+=DELIVERY_COST;

      var users = Object.keys(accounts).map(function(acc, i) {
        return "$('.debets .account_input:eq(" + i + ") input').val('" + acc + "');" +
               "$('.currency.debets .currency_input:eq(" + i + ") input').val('" + accounts[acc] + " "+DELIVERY_COST+"/"+order.orders.length+"');";
      }).join('');
      var total = "$('.credits .account_input:eq(0) input').val('" + args + "');" +
               "$('.currency.credits .currency_input:eq(0) input').val('" + totalPrice + "');" +
               "$('.debets .currency_input input:first').change();$('.credits .currency_input input:first').change()";
      channel.send('`javascript:' + users + total + '`');
    });
  },
  load: function(channel, message, args) {
    if (order != null) return channel.send("there's an order open already. close if it first");
    var exists = fs.existsSync(__dirname + '/' + args);
    if (!exists) return channel.send("couldn't find file " + args);
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
  }
}

slack.on('error', function(err) { console.log(err); });

function createOrder(channel, message, user, text) {
  if (order == null) return channel.send("there's no open order. open one with 'fisk! openorder'");
  var didUpdateOrder = false;
  order.orders.forEach(function(order) {
    if (order.user == user) order.text += ", " + text;
    else return;
    channel.send("updated order for " + user + ": " + order.text);
    didUpdateOrder = true;
  });
  if (didUpdateOrder) return;
  var newOrder = {user: user || "unnamed user", text: text};
  order.orders.push(newOrder);
  channel.send("added an order for " + user + ": " + newOrder.text);
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
    channel.send('order for ' + user + ' changed to: ' + order.text);
  });
  if (!didFindAMatch) channel.send("didn't find an order for " + user + " to change");
  saveorder();
}


slack.login();
