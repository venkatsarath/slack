const request = require('supertest');
const nock = require('nock');

const helper = require('.');
const fixtures = require('../fixtures');

const { probot } = helper;

describe('Integration: subscriptions', () => {
  describe('unauthenticated user', () => {
    test('is prompted to authenticate before subscribing', async () => {
      // User types slash command
      const command = fixtures.slack.command({
        text: 'subscribe https://github.com/kubernetes/kubernetes',
      });
      const req = request(probot.server).post('/slack/command').send(command);
      const res = await req.expect(200);

      // User is shown ephemeral prompt to authenticate
      const promptUrl = /^https:\/\/example\.com(\/github\/oauth\/login\?state=(.*))/;
      const text = res.body.attachments[0].actions[0].text;
      const url = res.body.attachments[0].actions[0].url;
      expect(text).toMatch('Connect GitHub account');
      expect(url).toMatch(promptUrl);
    });
  });

  describe('authenticated user', () => {
    beforeEach(async () => {
      const { SlackUser, GitHubUser } = helper.robot.models;

      // create user
      const user = await GitHubUser.create({
        id: 2,
        accessToken: 'github-token',
      });
      await SlackUser.create({
        slackId: 'U2147483697',
        githubId: user.id,
      });
    });

    describe('without the GitHub App installed', () => {
      test('prompts to install app', async () => {
        nock('https://api.github.com').get('/app').reply(200, fixtures.app);
        nock('https://api.github.com').get('/orgs/atom').reply(200, fixtures.org);

        const command = fixtures.slack.command({
          text: 'subscribe atom/atom',
        });

        await request(probot.server).post('/slack/command').send(command)
           .expect(200)
           .expect((res) => {
             expect(res.body).toMatchSnapshot();
           });
      });
    });

    describe('with GitHub App installed', () => {
      beforeEach(async () => {
        // Create an installation
        await helper.robot.models.Installation.create({
          githubId: 1,
          ownerId: fixtures.org.id,
        });
      });

      test('successfully subscribing and unsubscribing to a repository', async () => {
        nock('https://api.github.com').get('/orgs/kubernetes').times(2).reply(200, fixtures.org);
        nock('https://api.github.com').get('/repos/kubernetes/kubernetes').times(2).reply(200, fixtures.repo);
        nock('https://api.github.com').get('/repos/kubernetes/kubernetes/pulls?per_page=1').reply(200, {});

        const command = fixtures.slack.command({
          text: 'subscribe https://github.com/kubernetes/kubernetes',
        });

        await request(probot.server).post('/slack/command').send(command)
          .expect(200)
          .expect((res) => {
            expect(res.body).toMatchSnapshot();
          });

        const unsubscribeCommand = fixtures.slack.command({
          text: 'unsubscribe https://github.com/kubernetes/kubernetes',
        });

        await request(probot.server).post('/slack/command').send(unsubscribeCommand)
          .expect(200)
          .expect((res) => {
            expect(res.body).toMatchSnapshot();
          });
      });

      test('successfully subscribing with repository shorthand', async () => {
        nock('https://api.github.com').get('/orgs/atom').reply(200, fixtures.org);
        nock('https://api.github.com').get('/repos/atom/atom').reply(200, fixtures.repo);
        nock('https://api.github.com').get('/repos/atom/atom/pulls?per_page=1').reply(200, {});

        const command = fixtures.slack.command({ text: 'subscribe atom/atom' });

        await request(probot.server).post('/slack/command').send(command)
          .expect(200)
          .expect((res) => {
            expect(res.body).toMatchSnapshot();
          });
      });


      test('subscribing with a bad url', async () => {
        const command = fixtures.slack.command({
          text: 'subscribe wat?',
        });

        const req = request(probot.server).post('/slack/command').send(command);

        await req.expect(200).expect((res) => {
          expect(res.body).toMatchSnapshot();
        });
      });
    });
  });
});