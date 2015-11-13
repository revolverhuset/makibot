var menuPages = [
  'http://bestill.isushi.no/shop/1/cat/51', //småretter
  'http://bestill.isushi.no/shop/1/cat/49', // maki-fisk
  'http://bestill.isushi.no/shop/1/cat/100', // maki-kjøtt
  'http://bestill.isushi.no/shop/1/cat/102', // maki-vegetar
  'http://bestill.isushi.no/shop/1/cat/48', // kombo
  'http://bestill.isushi.no/shop/1/cat/46', // mix
  'http://bestill.isushi.no/shop/1/cat/50', // maki box
  'http://bestill.isushi.no/shop/1/cat/52', // nigiri
  'http://bestill.isushi.no/shop/1/cat/53', //sashimi
  'http://bestill.isushi.no/shop/2/cat/47', //tilbehør
  'http://bestill.isushi.no/shop/2/cat/54', //annet tilbehør
  'http://bestill.isushi.no/shop/2/cat/55' //drikke
];

var jsdom = require('jsdom');
var async = require('async');
var _ = require('underscore');
var augur = require('augur');
var similarity = require('string-similarity');

var menu = augur();
async.map(menuPages, function(page, cb) {
  jsdom.env(page, function(err, window) {
    if (err) return cb();
    var items = window.document.querySelectorAll('.product_article');
    var collected = [];
    if (!items || items.length == 0) {
      console.log('warning!', page, 'returned no menu items.');
      return callback(null, [])
    }
    [].forEach.call(items, function(item) {
      var title = item.querySelector('h3');
      if (!title) return;
      var menuItem = { name: title.innerHTML.trim() };
      var price = item.querySelector('.product_price');
      if (!price) {
        menuItem.price = 0;
        return collected.push(menuItem);
      }
      var price = parseFloat(price.innerHTML.trim().replace(',','.'))
      menuItem.price = isNaN(price) ? 0 : price;
      
      var articleIdEl = item.querySelector('input');
      menuItem.id = articleIdEl.getAttribute('product_id');

      collected.push(menuItem);
    });
    cb(null, collected);
  });
}, function(err, pageItems) {
  var menuItems = _.flatten(pageItems);
  menu(null, menuItems);
})

function fetchPriceForItem(fetchPriceFor, callback) {
  menu.then(function(e, menu) {
    var menu = _.clone(menu);   
    menu.forEach(function(item) {
      item.distance = similarity.compareTwoStrings(fetchPriceFor, item.name);
    });
    callback(null, _.sortBy(menu, function(d) { return -d.distance })[0])
  });
};

var splitters = ['og','and',',','&','+'];
module.exports = {
  fetchMatchesForOrder: function(order, callback) {
    var parts = order.split(/(og|and|[,&+])\s/).filter(function(p) {
      return splitters.indexOf(p) == -1 && !!p && !!p.trim();
    });
    async.map(parts, function(part, cb) {
      fetchPriceForItem(part, cb)
    }, callback)
  },
  bestMatch: function(query, callback) {
    fetchPriceForItem(query, callback);
  },
  searchMatches: function(query, callback) {
    menu.then(function(e, menu) {
      var results = menu.filter(function(menuItem) {
        if (!menuItem) return false;
        menuItem.distance = similarity.compareTwoStrings(query, menuItem.name);
        return menuItem.distance > 0.35
      })
      results = _.sortBy(results, function(item) { return item.distance });
      callback(null, results)
    });
  }
}
