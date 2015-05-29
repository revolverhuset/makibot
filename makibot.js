var Slack = require('slack-client');
var fs = require('fs');
var token = require('./token.json');
var aliases = require('./aliases.json');

var slack = new Slack(token, true, true);

var order = undefined;

slack.on('message', function(message) {
  if (!message.text) return;
  if (!message.text.match(/^fisk!/)) return;
  var channel = slack.getChannelGroupOrDMByID(message.channel);
  var grp = message.text.match(/^fisk!\s+(\w+)\s*(.*)$/, '');
  if (!grp) return channel.send('dammit helge!')
  if (!grp[1] || !handlers[grp[1]]) {
    channel.send('unsupported command! try one of these: ' + Object.keys(handlers).join(', '))
  } else {
    handlers[grp[1]](channel, message, grp[2]);
  }
});

var handlers = {
  openorder: function(channel, message, args) {
    if (order != null) {
      return channel.send("there's already an open order. close it first with 'fisk! closeorder'");
    }
    order = {orders:[],id: "order_" + Date.now()};
    channel.send('opened a new order!');
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
      return order.user + ": " + order.text
    }).join('\n'));
  },
  closeorder: function(channel, message) {
    if (order == null) return channel.send("there's no open order.");
    var fn = order.id + ".json";
    fs.writeFileSync(fn, JSON.stringify(order));
    order = undefined;
    channel.send("closed order and stashed it as " + fn);
  },
  replace: function(channel, message, args) {
    if (!message.user) return;
    var user = slack.getUserByID(message.user);
    if (!user) return;
    changeOrder(channel, message, user.name, args);
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

slack.on('error', function(err) { console.log(err) });

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
}


slack.login()
