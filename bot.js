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
}

ScoreBot.prototype = {
	responses: [],

	say: function (str) {
	  this.bot.say(config.channels[0], str);
	},

	respond: function (from, to, text, message) {
		if (from.match(/bot/i)) {
			return;

		} else if (text.match(/^(man )?scorebot|scorebot help$/i)) {
			this.say('I am a score-keeping bot for ++s! You can view my source at https://github.com/heated/ScoreBot');

		} else if (text.match(/(\w+)\+\+/)) {
			this.incScore( text.match(/(\w+)\+\+/)[1] );

		} else if (text.match(/^scores|score list/i)) {
			this.listScores();
		}
	},

	incScore: function (name) {
		redisClient.zincrby('scores', 1, name.toLowerCase(), redis.print);
	},

	listScores: function () {
		redisClient.zrevrange('scores', 0, 4, 'withscores', this.outputScores.bind(this));
	},

	outputScores: function (error, scores) {
		this.say('Top 5 ++ scores:');

		_(scores)
			.groupBy(function (element, index) {
				return Math.floor(index / 2);
			})
			.each(function (entry) {
				this.say(entry.join(': '));
			}, this);
	}
}

scoreBot = new ScoreBot();
