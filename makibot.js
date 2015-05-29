var Slack = require('slack-client');
var fs = require('fs');
var token = require('./token.json');

var slack = new Slack(token, true, true);

var order = undefined;

slack.on('message', function(message) {
  if (!message.text.match(/^fisk!/)) return;
  var channel = slack.getChannelGroupOrDMByID(message.channel);
  var grp = message.text.match(/^fisk!\s+(\w+)\s*(.*)$/, '');
  if (!handlers[grp[1]]) {
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
    order = {orders:[],time:Date.now()};
    channel.send('opened a new order!');
  },
  order: function(channel, message, args) {
    var user = slack.getUserByID(message.user);
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
    var fn = (new Date()) + ".json";
    fs.writeFileSync(fn, JSON.stringify(order));
    order = undefined;
    channel.send("closed order and stashed it as " + fn);
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



slack.login()
