import {MongoClient} from 'mongodb'

import {fromEvent} from 'rxjs/observable/fromEvent'
import {map} from 'rxjs/operator/map'
import {fromPromise} from 'rxjs/observable/fromPromise'
import {concatMap} from 'rxjs/operator/concatMap'
import {mapTo} from 'rxjs/operator/mapTo'
import {filter} from 'rxjs/operator/filter'

import Snoowrap from 'snoowrap'
import Snoostorm from 'snoostorm'
import sentiment from 'sentiment'
import _ld from 'languagedetect'

const ld = new _ld();

MongoClient.connect(process.env.MONGO_URI, (err, c) => {
	if (err) {
		throw err
	}

	const db = c.db('sentimentbot');

	const words = {
		'xd': 3
	};

	const r = new Snoowrap({
		userAgent: 'reddit-bot-example-node',
		clientId: process.env.REDDIT_CLIENT_ID,
		clientSecret: process.env.REDDIT_SECRET,
		username: process.env.REDDIT_USER,
		password: process.env.REDDIT_PASS
	});
	const client = new Snoostorm(r);

	const streamOpts = {
		subreddit: 'all',
		results: 25
	};

	const comments = client.CommentStream(streamOpts);

	fromEvent(comments, 'comment')
		::filter(({body}) => {
			const lng = ld.detect(body);
			return lng.length > 0 && lng[0][0] === 'eng';
		})
		::map(comment => {
			const {
				subreddit_id,
				author: {
					name
				},
				body,
				subreddit_name_prefixed,
				link_id,
			} = comment;

			const sen = sentiment(body, words);

			return {
				subreddit_id,
				name,
				subreddit_name_prefixed,
				link_id,
				score: sen.score
			}
		})
		//https://docs.mongodb.com/manual/reference/operator/update/inc/
		//updateOne inc each thing by the score
		::concatMap(comment => {
			return fromPromise(db.collection('subreddits').updateOne({
				subreddit: comment.subreddit_name_prefixed,
			}, {
				$inc: {score: comment.score}
			}, {
				upsert: true
			}))::mapTo(comment)
		})
		::concatMap(comment => {
			return fromPromise(db.collection('threads').updateOne({
				link_id: comment.link_id
			}, {
				$inc: {score: comment.score}
			}, {
				upsert: true
			}))::mapTo(comment)
		})
		::concatMap(comment => {
			return fromPromise(db.collection('users').updateOne({
				user: comment.name
			}, {
				$inc: {score: comment.score}
			}, {
				upsert: true
			}))::mapTo(comment)
		})
		::concatMap(comment => {
			return fromPromise(db.collection('reddit').updateOne({
				id: 'reddit',
			}, {
				$inc: {score: comment.score}
			}, {
				upsert: true
			}))
		})
		.subscribe(
			() => {},
			err => {throw err},
			() => { process.exit() }
		)
});

/*

 */