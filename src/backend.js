/**
 * Author: Sean Policarpio
 * Date: 08.09.2012 19:13:27
 * 
 * About: A Node.js backend for the SPARQL spread activiation visualisation for the Sindice Dataset Summary Graph
 * 
 */
 
 /*
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston,
 * MA 02110-1301, USA.
 * 
 */

 
 /*******************************************************************
 * Imports
 *******************************************************************/
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var express = require('express');
var $ = require('jquery');
var _ = require('underscore');
 
/*******************************************************************
 * Global Variables and Constants
 *******************************************************************/	
 
var predef_Sindice_query = "PREFIX analytics: <http://vocab.sindice.net/analytics#>  PREFIX any23: <http://vocab.sindice.net/>   SELECT DISTINCT ?class_label, ?class_card, ?property_label, ?property_card FROM <http://sindice.com/analytics> WHERE {       ?class any23:domain_uri <http://sindice.com/dataspace/default/domain/[DOMAINURI]>	 .           ?class analytics:cardinality ?class_card.           ?class analytics:label ?bnode .           ?bnode analytics:label ?class_label .      ?bnode analytics:rank1 '1'^^xsd:integer.       ?edge analytics:publishedIn <http://sindice.com/dataspace/default/domain/[DOMAINURI]>.      ?edge analytics:source ?class.       ?edge analytics:label ?property_label.      ?edge analytics:cardinality ?property_card.         FILTER(?class_card > [CARDLIMIT])      FILTER(?property_card > [CARDLIMIT])  }   ";

/*******************************************************************
 * Function Definitions
 *******************************************************************/
 
/* Constructs the SPARQL query to retrieve the necessary analytics from Sindice */
function constructQuery(domain_uri, card_limit){
    
    return predef_Sindice_query.replace(/\[DOMAINURI\]/g, domain_uri).replace(/\[CARDLIMIT\]/g, card_limit);

}

/* Turn the JSON returned result from Sindice into a graph model */
function prepareSpreadActivationGraphModel(data, domain_uri, init_activation, fire_threshold, decay_factor){
    
    // initialise the graph model
    var model = { domain : domain_uri };
    // each node = (key->URI, values->parent_node, cardinality, activation)
    model.nodes = {};
    model.nodes[domain_uri] = [0, 1, 1.0];
    
    // get the SPARQL binding results
    var bindings = data.results.bindings;
    
    // for each result, incrementally construct the graph models child nodes
    _.each(bindings, function(r){
        
        // create instances of the child classes and their cardinalities
        var classURI = r['class_label'].value;
        var classCard = parseInt(r['class_card'].value);        
        
        // add the child class
        model.nodes[classURI] = [domain_uri, classCard, parseFloat(init_activation)];
        
        // for each child class, append their associated properties and cardinalities
        var propertyURI = r['property_label'].value;
        var propertyCard = parseInt(r['property_card'].value);
        
        // initialise the object if it hasn't been already
        if ( !_.isArray(model.nodes[propertyURI]) ){
            model.nodes[propertyURI] = [];
        }
        // add the child properties
        model.nodes[propertyURI] = [classURI, propertyCard, parseFloat(init_activation)];        
        
    });
    
    // perform the recursive spread activation algorithm
    spreadActivate(model, domain_uri, fire_threshold, decay_factor);
    
    return model;
    
}

/* This will perform the spread activation algorithm over the passed model */
function spreadActivate(model, nodeURIIndex, fire_threshold, decay_factor){
    
    var PARENT = 0, CARD = 1, A = 2;
    
    // perform activation for all child classes/property nodes
    _.each(model.nodes, function(j, URIkey){   
        
        if (j[PARENT] == nodeURIIndex && j[A] >= fire_threshold){
            
            var parentActivation = (model.nodes[j[PARENT]])[A];
            
            // A [ j ] = A [ j ] + (A [ i ] * W [ i, j ] * D)
            j[A] = parseFloat(j[A]) + (parseFloat(parentActivation) * parseFloat(j[CARD]) * parseFloat(decay_factor));

            // set upper/lower bounds of activation value
            if (j[A] > 1){ j[A] = 1; }
            if (j[A] < 0){ j[A] = 0.01; }
            
            // recursively call for child node for current node
            spreadActivate(model, URIkey, fire_threshold, decay_factor);
            
        }
        
    });
    
}


/*******************************************************************
 * Node.js Server Program
 *******************************************************************/

// create the server using express.js
console.log("starting server...");
var server = express();

// tell express to parse HTTP requests into JSON
server.use(express.bodyParser());

// serve the webpage folder as a normal HTTP server
server.use(express.static('../webpage'));

// handle GET requests to the server
server.get('/activate', function(req, res){

    // GET request variables are available in req.query    
    // get the URI of the dataset(s) to query as well as other parameters
    var sindice_DatasetURI = req.query['dataset_uri'];
    var initial_Activation = req.query['init_A'];
    var fire_threshold = req.query['f'];
    var decay_factor = req.query['d'];
    var card_limit = req.query['card_limit'];
    
    // TODO verify GET variables
    
    // construct the Sindice query
    var query = constructQuery(sindice_DatasetURI, card_limit);
    
    // communicate with Sindice SPARQL ep to retrieve analytics
    $.ajax({
       url: 'http://sparql.sindice.com/sparql?query=' + escape(query),
       dataType: 'json',
       success: function(data, textStatus, jqXHR){
           // turn the returned data into the spreading activation graph model and return it via AJAX
           res.send(prepareSpreadActivationGraphModel(data, sindice_DatasetURI, initial_Activation, fire_threshold, decay_factor));
       },
       error: function(jqXHR, textStatus, errorThrown){
           console.log(textStatus + " " + errorThrown);
           res.send(500);
       }
    });
      
});

/*******************************************************************
 * Start the server
 *******************************************************************/ 
server.listen(8045);
