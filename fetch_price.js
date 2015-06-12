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

async.map(menuPages, function(page, cb) {
  jsdom.env(page, function(err, window) {
    if (err) return cb();
    var items = window.document.querySelectorAll('.one-quarter');
    var collected = [];
    if (!items) {
      console.log('warning!', page, 'returned no menu items.');
      return callback(null, [])
    }
    [].forEach.call(items, function(item) {
      var title = item.querySelector('h4 span');
      if (!title) return;
      var menuItem = { name: title.innerText };
      var desc = item.querySelector('p');
      var matchPrice = /(\d+),[\d-]+\s*$/;
      if (!desc || !desc.innerText || !desc.innerText.match(matchPrice)) {
        menuItem.price = 0;
        collected.push(menuItem);
        return;
      }

      var price = desc.innerText.match(matchPrice)[1];
      menuItem.price = parseInt(price, 10);

      collected.push(menuItem);
    });
    cb(null, collected);
  });
}, function(err, pageItems) {
  var menu = _.flatten(pageItems);
  console.log(menu);
})

