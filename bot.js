var _ = require('lodash'),
	irc = require('irc'),
	redis = require('redis'),
	url = require('url'),

	config = {
		channels: [process.env.IRC_CHANNEL],
		server: process.env.IRC_SERVER,
		botName: 'ScoreBot'
	};

if (process.env.REDISTOGO_URL) {
	var rtg = url.parse(process.env.REDISTOGO_URL);
	var redisClient = redis.createClient(rtg.port, rtg.hostname);

	redisClient.auth(rtg.auth.split(':')[1]);
} else {
	var redisClient = redis.createClient();
}

function ScoreBot() {
	this.bot = new irc.Client(config.server, config.botName, {
		channels: config.channels
	});

	this.bot.addListener('message', this.respond.bind(this));
	this.bot.addListener('names', this.recordNicks.bind(this));
	this.bot.addListener('join', this.recordNewPerson.bind(this));
	this.bot.addListener('message', this.saysSomethingAboutSomeone.bind(this));
}

ScoreBot.prototype = {
	responses: [],

	say: function (str) {
		this.bot.say(config.channels[0], str);
	},

	respond: function (from, to, text, message) {
		if (from.match(/bot/i)) {
			return;

		} else if (text.match(/^man scorebot|scorebot help$/i)) {
			this.say('I am a score-keeping bot for ++s! You can view my source at https://github.com/heated/ScoreBot');

		} else if (text.match(/\w+\+\+/)) {
			var match = text.match(/(\w+)\+\+/)[1];
			var name = this.standardizeName(match);

			if (name !== this.standardizeName(from)) {
				this.ifOneOfUs(name, this.incScore.bind(this, name));
			}

		} else if (text.match(/^scores|score list/i)) {
			this.listScores();

		} else if (text.match(/^\w+('s)? score/i)) {
			var match = text.match(/^(\w+)('s)? score/i)[1];
			var name = this.standardizeName(match);
			this.sayScore(name);
		} else if (text.match(/who is \w+/i)) {
			var match = text.match(/who is (\w+)/i)[1];
			var name = this.standardizeName(match);
			this.sayWhoIs(name);
		}
	},

	standardizeName: function(name) {
		return name.replace(/[\d_]+$/, '').toLowerCase();
	},

	incScore: function (name) {
		redisClient.zincrby('scores', 1, name, redis.print);
    console.log('Deflated ' + name + "'s bumbums.");
	},

	sayScore: function (name) {
		redisClient.zscore('scores', name, this.outputScore.bind(this, name));
	},

	outputScore: function (name, error, points) {
		if (points === null) {
			points = '∞';
		} else {
			points = (1 / points).toFixed(3);
		}

		if (points === '0.000') {
			points = 'no';
		}

		this.say(name + ' has ' + points + ' bumbum' + (points === '1.000' ? '' : 's'));
	},

	listScores: function () {
		redisClient.zrevrange('scores', 0, 4, 'withscores', this.outputScores.bind(this));
	},

	outputScores: function (error, scores) {
		this.say('Lowest five bumbums:');

		var grouped = _.groupBy(scores, function (element, index) {
		  return Math.floor(index / 2);
		});

		_.each(grouped, function (entry) {
		  this.outputScore(entry[0], null, entry[1]);
		}, this);
	},

	recordNicks: function (channel, nicks) {
		var standard_nicks = Object.keys(nicks).map(this.standardizeName.bind(this));
		redisClient.sadd('nick_names', standard_nicks);
	},

	recordNewPerson: function (channel, nick, message) {
		redisClient.sadd('nick_names', nick);
	},

	saysSomethingAboutSomeone: function (from, to, text, message) {
    var nameAndDescription = text.match(/(\w+) is (.+)/);
    
		if (nameAndDescription) {
			var name = this.standardizeName(nameAndDescription[1]);
			this.ifOneOfUs(name, function () {
				redisClient.sadd('whois' + name, nameAndDescription[2]);
			});
		}
	},

	sayWhoIs: function (nick) {
		var msg = nick + ' is ';
		var that = this;
		this.ifThereIsSomethingToSay(nick, function () {
			redisClient.smembers('whois' + nick, function (error, descriptions) {
				that.say(msg + descriptions.join(', ') + '.');
			})
		})
	},

	ifOneOfUs: function (name, ifCallback) {
		redisClient.sismember('nick_names', name, function (error, isANameOnChannel) {
			if (isANameOnChannel) {
				ifCallback();
			}
		})
	},

	ifThereIsSomethingToSay: function (name, ifCallback) {
		redisClient.scard('whois' + name, function (error, numberOfDescriptors) {
			if (numberOfDescriptors > 0) {
				ifCallback();
			}
		})
	}
}

scoreBot = new ScoreBot();
