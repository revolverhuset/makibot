var menuPages = [
  'http://www.isushi.no/maki',
  'http://www.isushi.no/mix/',
  'http://www.isushi.no/kombo-4/',
  'http://www.isushi.no/maki-box/',
  'http://www.isushi.no/nigiri/',
  'http://www.isushi.no/sashimi/',
  'http://www.isushi.no/smaretter/',
  'http://www.isushi.no/ekstra/'
];

var jsdom = require('jsdom');
var async = require('async');
var _ = require('underscore')
var augur = require('augur');

var menu = augur();
async.map(menuPages, function(page, cb) {
  jsdom.env(page, function(err, window) {
    if (err) return cb();
    var items = window.document.querySelectorAll('.one-quarter');
    var collected = [];
    if (!items || items.length == 0) {
      console.log('warning!', page, 'returned no menu items.');
      return callback(null, [])
    }
    [].forEach.call(items, function(item) {
      var title = item.querySelector('h4 span');
      if (!title) return;
      var menuItem = { name: title.innerHTML };
      var desc = item.querySelectorAll('p');
      if (desc.length == 0) {
        menuItem.price = 0;
        return collected.push(menuItem);
      }
      var matchPrice = /(\d+),[\d-]+\s*$/;
      var concatDesc = [].map.call(desc, function(d) { return d.innerHTML }).join(' ');
      var priceMatch = concatDesc.match(matchPrice);
      menuItem.price = priceMatch ? parseInt(priceMatch[1], 10) : 0;

      collected.push(menuItem);
    });
    cb(null, collected);
  });
}, function(err, pageItems) {
  var menu = _.flatten(pageItems);
  menu(null, pageItems);
})

