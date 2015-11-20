var async = require('async');
var _ = require('underscore');
var price = require('./fetch_price');
var request = require('request');
var serialize = require('serialize-like-php');

var user = {
  customer_id: '1146',
  customer_name: 'Jon Packer',
  customer_mobile: '47229085',
  customer_discount_percent: 0,
  delivery_address: {
    address: 'Olav Kyrres gate 28',
    zip: '5015',
    city: 'BERGEN',
    entrance: '',
    floor: '',
    extra_address_info: ''
  }
};

module.exports = function(order, mobileNumber, callback) {
  user.customer_mobile = mobileNumber;
  matchOrders(order, function(e, matched) {
    if (e) return callback(e);
    var postData = {
      address: user.delivery_address.address,
      city: 'BERGEN',
      confirm_delivery: 1,
      delivery_days_from_now: 0,
      delivery_time: 0,
      entrance: '',
      extra_address_info: 'Hentes utenfor bygget',
      floor: '',
      frontline_store_sync_code_that_covers_zip: 457041565642,
      note: getBoxPartitioning(matched),
      payment_method: 'bank_terminal',
      zip: 5015
    };
    var cart = _.extend({ products: getCartObject(matched) }, user);
    var cookie ='shopping_cart=' + encodeURIComponent(serialize.serialize(cart)); 
    request.post('http://bestill.isushi.no/shop/checkout', {
      form: postData,
      followRedirect: false,
      headers: { Cookie: cookie }
    }, function(err, response, body) {
      if (err) return callback(err);
      console.log(require('util').inspect(response));
      callback(null, {url: response.headers['location'], cookie: cookie})
    });
  })
}

function matchOrders(order, cb) {
  async.map(order.orders, function(order, cb) {
    price.fetchMatchesForOrder(order.text, function(e, matches) {
      if (e) return cb(e);
      else cb(null, {matches: matches, user:order.user});
    });
  }, cb)
}

function getCartObject(orders) {
  return orders.reduce(function(cart, order) {
    order.matches.forEach(function(match) {
      if (cart[match.id] == null) cart[match.id] = 1;
      else ++cart[match.id];
    });
    return cart;
  }, {});
}

function getBoxPartitioning(orders) {
  return orders.reduce(function(partitioning, order, i) {
    partitioning.push('Box ' + (i+1) + ': ' + _.pluck(order.matches, 'name').join(', '));
    return partitioning;
  }, [orders.length + ' sett med pinner & soyasaus']).join(' \n');
};
