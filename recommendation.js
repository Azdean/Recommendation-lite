/* Recommendation.js
  Authors: UP616941, *, *
  Demonstration of Collaborative Filter and Proportional Representation recommendation methods.
*/

const MongoClient = require('mongodb').MongoClient;
const g = require('ger');
const esm = new g.MemESM();
const ger = new g.GER(esm);
const assert = require('assert');

var categoryGroups = JSON.parse('[{"cluster":[{"cat":"young-adult-fiction","weight":0.34375},{"cat":"fantasy","weight":0.3125},{"cat":"young-adult-fiction-fantasy","weight":0.3125},{"cat":"series","weight":0.1875},{"cat":"young-adult-fiction-series","weight":0.1875},{"cat":"love-and-romance","weight":0.0625},{"cat":"young-adult-fiction-love-and-romance","weight":0.0625}],"weight":1.46875,"percentage":55,"categories":["young-adult-fiction","fantasy","young-adult-fiction-fantasy","series","young-adult-fiction-series","love-and-romance","young-adult-fiction-love-and-romance"],"id":"PA0"},{"cluster":[{"cat":"young-adult-fiction","weight":0.34375},{"cat":"action-and-adventure","weight":0.09375},{"cat":"sci-fi","weight":0.09375},{"cat":"young-adult-fiction-sci-fi","weight":0.09375},{"cat":"young-adult-fiction-action-and-adventure","weight":0.03125}],"weight":0.65625,"percentage":24,"categories":["young-adult-fiction","action-and-adventure","sci-fi","young-adult-fiction-sci-fi","young-adult-fiction-action-and-adventure"],"id":"PA1"},{"cluster":[{"cat":"action-and-adventure","weight":0.09375},{"cat":"children-fiction","weight":0.09375},{"cat":"children-fiction-classics","weight":0.0625},{"cat":"children-fiction-legends-myths-and-fables","weight":0.0625},{"cat":"classics","weight":0.0625},{"cat":"legends-myths-and-fables","weight":0.0625},{"cat":"tweens-fiction","weight":0.0625},{"cat":"tweens-fiction-action-and-adventure","weight":0.0625}],"weight":0.5625,"percentage":21,"categories":["action-and-adventure","children-fiction","children-fiction-classics","children-fiction-legends-myths-and-fables","classics","legends-myths-and-fables","tweens-fiction","tweens-fiction-action-and-adventure"],"id":"PA2"}]');
var databaseURL = "mongodb://localhost:27017/recommendation";
var id = '0001'; // ID that represents the user we are making recommendations for.
ger.initialize_namespace('categories'); // Initilise namespace for ger datastructure.
var noProductsToReturn = 10; // Defines the number of products to return.
var newProductPercentage = 0.2; // Percentage of final output to fill with products from the collaborative filter.

console.time('Execution time'); // Execution time.
// Grabs recommendations from the Collaborative Filter
function getRecommendation (id, callback) {
  if (id && typeof id === 'string') {
    ger.recommendations_for_person('categories', id, {
      'actions': {'likes': 1},
      'filter_previous_actions': ['likes']
    }).then(function(recommendation){
      callback(true, recommendation);
    });
  }
}

// Adds events to the Collaborative Filter
function addEvent(id, category) {
  if (id && typeof id === 'string' && category && typeof category === 'string') {
    var event = {
      namespace: 'categories',
      person: id,
      action: 'likes',
      thing: category,
      expires_at: new Date(+new Date + 12096e5)
    };
    ger.events([event]);
  }
};

// Dummy Data for Collaborative Filter to work off
ger.events([{
    namespace: 'categories',
    person: '00000000',
    action: 'likes',
    thing: 'young-adult-fiction',
    expires_at: new Date(+new Date + 12096e5)
  },
  {
    namespace: 'categories',
    person: '00000000',
    action: 'likes',
    thing: 'fantasy',
    expires_at: new Date(+new Date + 12096e5)
  },
  {
    namespace: 'categories',
    person: '00000000',
    action: 'likes',
    thing: 'history',
    expires_at: new Date(+new Date + 12096e5)
  }
]);

// Add recommendations from dummy data for the active user to the collaborative filter
for (var i = 0; i < categoryGroups.length; i++) {
  var group = categoryGroups[i];
  var cluster = group.cluster;

  for (var x = 0; x < cluster.length; x++) {
    var category = cluster[x].cat;
    addEvent(id, category);
  }
}

function outputRecommendations (){
  MongoClient.connect(databaseURL, function (err, db){
    if (!err) {
      var productCache = [];
      var collabProductFlag = false; //Toggled true when products have been collected from the collaborative filter
      var collabproductCache = [];

      function collabFilter(flag, recommendation) {
        if (flag) {
          if (recommendation.recommendations.length) {
            var recommendation = recommendation.recommendations[0].thing;
            var noNewProducts = (noProductsToReturn * newProductPercentage);

            db.collection('products').find({'cat.catid': recommendation}).toArray(function(err, docs){
              var products = [];
              if (docs.length) {
                for (var x = 0; x < noNewProducts; x++) {
                  var randomNo = (Math.floor(Math.random() * docs.length));
                  var product = docs[randomNo];
                  products.push(product);
                  docs.splice(randomNo, 1);
                }
                collabProductStore = docs;
                categoryGroups.push({
                  'cluster': [recommendation],
                  'weight': null,
                  'percentage': (newProductPercentage * 100),
                  'categories': recommendation,
                  'products': products,
                  'id': 'CF0'
                });
                recommendationGenerator(0,products.length);
              } else {
                recommendationGenerator(0,0);
              }
            });
          } else {
            recommendationGenerator(0,0);
          }
        } else {
          getRecommendation(id, collabFilter);
        }
      }
      collabFilter(false, []);

      function recommendationGenerator(i, noNewProducts){
        if (i < categoryGroups.length) {
          if(!('products' in categoryGroups[i])){
              var cluster    = categoryGroups[i];
              var categories = cluster.categories;
              var percentage = cluster.percentage;
              var limit      = Math.round((noProductsToReturn - noNewProducts) * (parseFloat(percentage) / 100.0));
              var iPos       = i;
              cluster.products = [];

              db.collection('products').find({'cat.catid': {$all: categories}}).toArray(function(err, docs){
                if (docs.length) {
                  for (var x = 0; x < limit; x++) {
                    var randomNo = (Math.floor(Math.random() * docs.length));
                    var product = docs[randomNo];
                    cluster.products.push(product);
                    docs.splice(randomNo, 1);
                  }
                  var productCacheInput = [];
                  for (var y = 0; y < docs.length; y++) {
                    var product = docs[y];
                    var idContainer = {};

                    idContainer.id = cluster.id;
                    idContainer.product = product;
                    productCacheInput.push(idContainer);
                  }
                  productCache.concat(productCacheInput);
                } else {
                    cluster.products = null;
                    for (var x = 0; x < limit; x++) {
                      if (collabproductCache.length) {
                        var randomNo = (Math.floor(Math.random() * collabproductCache.length));
                        var product = collabproductCache[randomNo];
                        for (var i = 0; i < categoryGroups.length; i++) {
                          var catCluster = categoryGroups[i];

                          if(catCluster.id === 'CF0'){
                            catCluster.products.push(product);
                          }
                        }
                        collabproductCache.splice(randomNo, 1);
                      } else if(productCache.length) {
                        var randomNo          = (Math.floor(Math.random() * productCache.length));
                        var product           = productCache[randomNo].product;
                        var productClusterId  = productCache[randomNo].id;
                        for (var i = 0; i < categoryGroups.length; i++) {
                          var catCluster = categoryGroups[i];

                          if(catCluster.id === productClusterId){
                            catCluster.products.push(product);
                          }
                        }
                        productCache.splice(randomNo, 1);
                    }
                  }
                }
                recommendationGenerator((iPos+1), noNewProducts);
              });
          } else {
            recommendationGenerator((iPos+1), noNewProducts);
          }
        } else {
          output(categoryGroups);
        }
      }
    } else {
      console.log("Database Connection Error.");
    }
  });
}
outputRecommendations();

function output(categoryGroups) {
  console.log('\n| Product Recommendations |');
  for (var i = 0; i < categoryGroups.length; i++) {
    var products = categoryGroups[i].products;

    if(products){
      for (var x = 0; x < products.length; x++) {
        var product = products[x];
        console.log(product.n);
      }
    }
  }

  console.log('\n| More Info |');
  for (var i = 0; i < categoryGroups.length; i++) {
    var cluster = categoryGroups[i];
    console.log('ID: ' + cluster.id);
    console.log('Type: ' + ((cluster.id.search('CF') ? 'Proportional Representation Algorithm' : 'Collaborative Filter')));

    var categories = '';
    if(typeof cluster.categories !== 'string'){
      for (var x = 0; x < cluster.categories.length; x++) {
        if(cluster.categories[x]){
          categories += '[' + cluster.categories[x] + '], ';
        }
      }
    } else {
        categories = cluster.categories;
    }
    console.log('Categories: ' + categories);

    console.log('Weight: ' + cluster.weight);
    console.log('Output Percentage: ' + cluster.percentage + '%');
    if(cluster.products === null){
        console.log('Number of products recommended from this cluster:' + ' 0');
        console.log('Recommended products belonging to this cluster:' + ' None');
        console.log('Cluster returned no viable products');
    } else {
      console.log('Number of products recommended from this cluster: ' + cluster.products.length);
      var productsRecommended = '';
      for (var x = 0; x < cluster.products.length; x++) {
        productsRecommended += '[' + cluster.products[x].n + '], ';
      }
      if (!productsRecommended) {
        productsRecommended = 'None';
      }
      console.log('Recommended products belonging to this cluster: ' + productsRecommended);
    }
    console.log('|------------------------------|');
  }

  console.timeEnd('Execution time');
  process.exit(0);
}
