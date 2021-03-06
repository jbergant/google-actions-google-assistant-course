'use strict';

const config = require('./config/config');
const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
//const {Card, Suggestion} = require('dialogflow-fulfillment');

const { BasicCard, Button, Image, List} = require('actions-on-google');

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

var admin = require("firebase-admin");

var serviceAccount = require("./config/udemy-demo-assistant-7912e-firebase-adminsdk-63ims-24dd853435.json");


if (!config.MEETUP_KEY) {
    throw new Error('missing MEETUP_KEY');
}

const requestAPI = require('request-promise');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://udemy-demo-assistant-7912e.firebaseio.com"
});

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    const agent = new WebhookClient({ request, response });
    console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

    const conv = agent.conv(); // Get Actions on Google library conv instance

    if ( conv !== null && conv.data.bitcoinInvestment === undefined ) {
        conv.data.bitcoinInvestment = 10000;
    }

    if ( conv !== null && conv.data.bitcoinPrices === undefined ) {
        conv.data.bitcoinPrices = [];
    }
    
    if ( conv !== null && conv.data.meetupData === undefined ) {
        conv.data.meetupData = [];
    }

    if ( conv !== null && conv.data.meetupCount === undefined ) {
        conv.data.meetupCount = 0;
    }

    const hasScreen = conv !== null &&
        conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');
    const hasAudio = conv !== null &&
        conv.surface.capabilities.has('actions.capability.AUDIO_OUTPUT');

    function welcome(agent) {
        agent.add(`Welcome to my agent!`);
    }

    function fallback(agent) {
        agent.add(`I didn't understand`);
        agent.add(`I'm sorry, can you try again?`);
    }

    function checkIfGoogle(agent) {
        let isGoogle = true;
        if ( conv === null ) {
            agent.add(`Only requests from Google Assistant are supported.
            Find the XXX action on Google Assistant directory!`);
            isGoogle = false;
        }
        return isGoogle;
    }

    async function listMeetups(agent) {
        if ( checkIfGoogle(agent) ) {
            let response = await getMeetupList(); // let's display first meetup
            agent.add(response);
        }
    }

    async function getMeetupList() {
        conv.data.meetupCount = 0;
        if (conv.data.meetupData.length === 0 ) {
            await getMeetupData();
            return buildMeetupListResponse();

        } else {
            return buildMeetupListResponse();

        }
    }

    async function showMeetups(agent) {
        if ( checkIfGoogle(agent) ) {
            let response = await displayMeetup(); // let's display first meetup
            agent.add(response);
        }
    }

    async function repeatMeetup(agent) {
        if ( checkIfGoogle(agent) ) {
            let response = await displayMeetup();
            agent.add(response);
        }
    }

    async function previousMeetup(agent) {
        if ( checkIfGoogle(agent) ) {
            conv.data.meetupCount--;
            let response = await displayMeetup();
            agent.add(response);
        }
    }

    async function nextMeetup(agent) {
        if ( checkIfGoogle(agent) ) {
            conv.data.meetupCount++;
            let response = await displayMeetup();
            agent.add(response);
        }
    }

    async function selectByNumberMeetup(agent) {
        if ( checkIfGoogle(agent) ) {
            let option = agent.contexts.find(function (obj) {
                return obj.name === 'actions_intent_option';
            });
            if ( option && option.hasOwnProperty('parameters') && option.parameters.hasOwnProperty('OPTION')) {
                conv.data.meetupCount = parseInt(option.parameters.OPTION.replace('meetup ', ''));
            }

            let number = agent.parameters['number'];
            if ( number.length > 0 ) {
                conv.data.meetupCount = parseInt(number[0]) - 1;
            }

            let response = await displayMeetup();
            agent.add(response);
        }
    }

    function buildMeetupListResponse() {
        let responseToUser;

        if ( conv.data.meetupData.length === 0 ) {
            responseToUser = 'No meetups available at this time!';
            conv.close(responseToUser);
        } else {
            let textList = 'This is a list of meetups. Please select one of them to proceed';
            let ssmlText = '<speak>This is a list of meetups. ' +
                'Please select one of them. <break time="1500ms" />';

            let image = 'https://raw.githubusercontent.com/jbergant/udemydemoimg/master/meetupS.png';
            let items = {};
            for (let i=0; i < conv.data.meetupData.length; i++) {
                let meetup = conv.data.meetupData[i];
                if (hasScreen) {
                    items['meetup ' + i] = {
                        title: 'meetup ' + (i + 1),
                        description: meetup.name,
                        image: new Image({
                            url: image,
                            alt: meetup.name,
                        }),
                    }
                }
                responseToUser += ' Meetup number ' + (i + 1) + ':';
                responseToUser += meetup.name;
                responseToUser += ' by ' + meetup.group.name;
                let date = new Date(meetup.time);
                responseToUser += ' on ' + date.toDateString() + '. ';

                if (i < 3 ) {
                    ssmlText += '  <say-as interpret-as="ordinal">' + (i + 1) + '</say-as> meetup. ' +
                        '  <break time="500ms" />' +
                        'Is ' + meetup.name + '. <break time="700ms" />' +
                        ' On ' + date.toDateString() + '.' +
                        ' For more information say "meetup ' + (i + 1) + '". <break time="1200ms" />';
                }

            }
            ssmlText += '</speak>';

            if ( hasAudio ) {
                conv.ask(ssmlText.replace('&', ' and '));
            } else {
                conv.ask(textList);
                conv.ask(responseToUser);

            }

            if (hasScreen) {
                conv.ask(new List({
                    title: 'List of meetups: ',
                    items
                }));
            }

        }
        return conv;
    }

    async function displayMeetup() {
        if (conv.data.meetupData.length === 0 ) {
            await getMeetupData();
            return buildSingleMeetupResponse();
        } else {
            return buildSingleMeetupResponse();
        }
    }


    function buildSingleMeetupResponse() {
        let responseToUser;
        if ( conv.data.meetupData.length === 0 ) {
            responseToUser = 'No meetups available at this time!';
            conv.close(responseToUser);
        } else if ( conv.data.meetupCount < 0 ) {
            responseToUser = 'No more meetups before this one!';
            conv.close(responseToUser);
        } else if ( conv.data.meetupCount < conv.data.meetupData.length ) {
            let meetup = conv.data.meetupData[conv.data.meetupCount];
            responseToUser = ' Meetup number ' + (conv.data.meetupCount + 1) + ' ';
            responseToUser += meetup.name;
            responseToUser += ' by ' + meetup.group.name;

            let date = new Date(meetup.time);
            responseToUser += ' on ' + date.toDateString() + '.';
            responseToUser += ' Write or say next meetup to see more.';

            if ( hasAudio ) {
                let ssmlText = '<speak>' +
                    ' <say-as interpret-as="ordinal">' + (conv.data.meetupCount + 1) + '</say-as> meetup. ' +
                    ' Is ' + meetup.name + '. <break time="1" />' +
                    ' By ' + meetup.group.name + '. <break time="1" />' +
                    ' On ' + date.toDateString() + '. <break time="1" />' +
                    '<break time="600ms" />For more visit website. <break time="800ms" />' +
                    ' Say next meetup for more.' +
                    '</speak>';
                conv.ask(ssmlText.replace('&', ' and '));
            } else {
                conv.ask(responseToUser);
            }


            if (hasScreen) {
                let image = 'https://raw.githubusercontent.com/jbergant/udemydemoimg/master/meetup.png';
                conv.ask(new BasicCard({
                    text: meetup.description,
                    subtitle: 'by ' + meetup.group.name,
                    title: meetup.name,
                    buttons: new Button({
                        title: 'Read more',
                        url: meetup.link,
                    }),
                    image: new Image({
                        url: image,
                        alt: meetup.name,
                    }),
                    display: 'CROPPED',
                }));
            }
        }
        return conv;
    }

    function getMeetupData() {
        return requestAPI('https://api.meetup.com/find/upcoming_events?' +
            '&sign=true&photo-host=public&lon=14.493240&page=30&lat=46.048226&key=' +
            config.MEETUP_KEY)
            .then(function (data) {
                let meetups = JSON.parse(data);
                if (meetups.hasOwnProperty('events')) {
                    saveData(meetups.events);
                }
            }).catch(function (err) {
                console.log('No meetups data');
                console.log(err);
            });
    }
    
    function panicAttack() {
        if ( checkIfGoogle(agent) ) {
            conv.ask('<speak>\n' +
                '  Step 1, take a deep breath. <break time="2600ms"/>\n' +
                '  Step 2, exhale.\n' +
                '  Step 3, take a deep breath again. <break strength="weak"/>\n' +
                '  Step 4, exhale.\n' +
                '</speak>'
            );
            agent.add(conv);
        }
    }

    function saveData(data) {
        if (conv !== null ) {
            conv.data.meetupData = data;
        }
    }

    async function voteResults(agent) {
        let voteResultsRef = admin.database().ref('artists').orderByChild('votes');

        let results = [];
        await voteResultsRef.once('value').then(function (snapshot) {
            snapshot.forEach(function (childSnapshot) {
                let childData = childSnapshot.val();
                results.push(childData);
            });
        }).then(function () {
            results.reverse();
        });

        let textResponse = '';
        for (let i = 0; i < results.length; i++) {
            let text = (i===0)? '': ', ';
            text += results[i].name + ' has ' + results[i].votes;
            text += (results[i].votes > 1) ? ' votes': ' vote';
            textResponse += text;
        }
        textResponse = 'Vote results are ' + textResponse;
        agent.add(textResponse);

    }

    function voting(agent) {

        let endConversation = false;
        let responseText = '';
        let singer = agent.parameters['Singer'];

        if ( singer !== '' ) {
            let artistName = singer.replace(' ', ''). toLowerCase();
            let currentArtist = admin.database().ref().child('/artists/' + artistName);

            currentArtist.once('value', function (snapshot) {
                if ( snapshot.exists() && snapshot.hasChild('votes') ) {
                    let obj = snapshot.val();
                    currentArtist.update({
                        votes: obj.votes + 1
                    })
                } else {
                    currentArtist.set({
                        votes: 1,
                        name: singer
                    })
                }
            });




            responseText = 'Thank you for voting!';
        } else {
            if (conv.data.voteFallback === undefined ) {
                conv.data.voteFallback = 0;
            }
            conv.data.voteFallback++;
            if ( conv.data.voteFallback > 2 ) {
                responseText = 'Thank you for voting. Your vote was refused. Try again later.';
                endConversation = true;
            } else {
                console.log('fulfillmentText');
                responseText = request.body.queryResult.fulfillmentText;
            }
        }

        if ( endConversation ) {
            conv.close(responseText);
        } else {
            conv.ask(responseText);
        }
        agent.add(conv);

    }

    async function earnWithBitcoin() {
        let now = new Date();
        now.setDate(now.getDate() - 1);
        let sellDate = formatDate(now);

        // beginning of the month
        let dateToCalculate = new Date();
        dateToCalculate.setDate(1);
        let startOfMonth = formatDate(dateToCalculate);

        // beginning of the year
        dateToCalculate = new Date();
        dateToCalculate.setDate(1);
        dateToCalculate.setMonth(0);
        let startOfYear = formatDate(dateToCalculate);

        // one year ago
        dateToCalculate = new Date();
        dateToCalculate.setFullYear(now.getFullYear() - 1);
        let aYearAgo = formatDate(dateToCalculate);

        // two years ago
        dateToCalculate = new Date();
        dateToCalculate.setFullYear(now.getFullYear() - 2);
        let twoYearAgo = formatDate(dateToCalculate);

        // three years ago
        dateToCalculate = new Date();
        dateToCalculate.setFullYear(now.getFullYear() - 3);
        let threeYearAgo = formatDate(dateToCalculate);


        let investmentStartOfMonth = await calculateInvestment(startOfMonth, sellDate);
        let earnedStartOfMonth = formatMoney(investmentStartOfMonth.earned.toFixed(0));
        let priceStartOfMonth = formatMoney(investmentStartOfMonth.investPrice.toFixed(2));

        let investmentStartOfYear = await calculateInvestment(startOfYear, sellDate);
        let earnedStartOfYear = formatMoney(investmentStartOfYear.earned.toFixed(0));
        let priceStartOfYear  = formatMoney(investmentStartOfYear.investPrice.toFixed(2));

        let investmentAYearAgo = await calculateInvestment(aYearAgo, sellDate);
        let earnedAYearAgo = formatMoney(investmentAYearAgo.earned.toFixed(0));
        let priceAYearAgo = formatMoney(investmentAYearAgo.investPrice.toFixed(2));

        let investmentTwoYearAgo = await calculateInvestment(twoYearAgo, sellDate);
        let earnedTwoYearAgo = formatMoney(investmentTwoYearAgo.earned.toFixed(0));
        let priceTwoYearAgo = formatMoney(investmentTwoYearAgo.investPrice.toFixed(2));

        let investmentThreeYearAgo = await calculateInvestment(threeYearAgo, sellDate);
        let earnedThreeYearAgo = formatMoney(investmentThreeYearAgo.earned.toFixed(0));
        let priceThreeYearAgo = formatMoney(investmentThreeYearAgo.investPrice.toFixed(2));

        conv.ask(`This is how much you would earn with bitcoin if you invested ${formatMoney(conv.data.bitcoinInvestment)}`);

        conv.ask(new BrowseCarousel({
            items: [
                new BrowseCarouselItem({
                    title: `Price ${priceStartOfMonth} euro`,
                    url: `https://bitcoins.now`,
                    description: `Beginning of this month`,
                    image: new Image({
                        url: `https://dummyimage.com/128x232/d90057/fff.png&text=${earnedStartOfMonth}`,
                        alt: `Earning from beginning of this month ${earnedStartOfMonth} euro`,
                    }),
                    footer: `Buy bitcoin`,
                }),
                new BrowseCarouselItem({
                    title: `Price ${priceStartOfYear} euro`,
                    url: `https://bitcoins.now`,
                    description: `Start of the year`,
                    image: new Image({
                        url: `https://dummyimage.com/128x232/d90057/fff.png&text=${earnedStartOfYear}`,
                        alt: `Earning from beginning of this year ${earnedStartOfYear} euro`,
                    }),
                    footer: `Buy bitcoin`,
                }),
                new BrowseCarouselItem({
                    title: `Price ${priceAYearAgo} euro`,
                    url: `https://bitcoins.now`,
                    description: `One year ago`,
                    image: new Image({
                        url: `https://dummyimage.com/128x232/d90057/fff.png&text=${earnedAYearAgo}`,
                        alt: `Earning from one year ago ${earnedAYearAgo} euro`,
                    }),
                    footer: `Buy bitcoin`,
                }),
                new BrowseCarouselItem({
                    title: `Price ${priceTwoYearAgo} euro`,
                    url: `https://bitcoins.now`,
                    description: `Two years ago`,
                    image: new Image({
                        url: `https://dummyimage.com/128x232/d90057/fff.png&text=${earnedTwoYearAgo}`,
                        alt: `Earning from two years ago ${earnedTwoYearAgo} euro`,
                    }),
                    footer: `Buy bitcoin`,
                }),
                new BrowseCarouselItem({
                    title: `Price ${priceThreeYearAgo} euro`,
                    url: `https://bitcoins.now`,
                    description: `Three years ago`,
                    image: new Image({
                        url: `https://dummyimage.com/128x232/d90057/fff.png&text=${earnedThreeYearAgo}`,
                        alt: `Earning from three years ago ${earnedThreeYearAgo} euro`,
                    }),
                    footer: `Buy bitcoin`,
                })
            ]
        }));
        agent.add(conv);
    }

    async function earnWithBitcoinPeriod() {
        if ( ! agent.parameters.hasOwnProperty('buyDate') ) {
            conv.ask('You did not specify any parameters');
            agent.add(conv);
            return;
        }

        let dateUnit = (agent.parameters['buyDate'].hasOwnProperty('date-unit')) ?
            agent.parameters['buyDate']['date-unit'] : false;                       // day, month, year

        let datePeriod = (agent.parameters['buyDate'].hasOwnProperty('date-period')) ?
            agent.parameters['buyDate']['date-period'] : false;                     // beginning or end

        let number = (agent.parameters['buyDate'].hasOwnProperty('number')) ?
            agent.parameters['buyDate']['number'] : 0;
        if ( !datePeriod && number === 0 ) number = 1; // a period ago

        let now = new Date();
        let dateToCalculate = new Date();

        switch (dateUnit) {
            case 'day':
                dateToCalculate.setDate(now.getDate() - number);
                break;
            case 'month':
                dateToCalculate.setMonth(now.getMonth() - number);
                if (datePeriod === 'end') {
                    dateToCalculate.setDate(new Date(now.getFullYear(), dateToCalculate.getMonth() + 1, 0).getDate());
                } else if (datePeriod === 'beginning') {
                    dateToCalculate.setDate(1);
                }

                break;
            case 'year':
                if (datePeriod === 'end') {
                    dateToCalculate.setDate(31);
                    dateToCalculate.setMonth(11);
                } else if (datePeriod === 'beginning') {
                    dateToCalculate.setDate(1);
                    dateToCalculate.setMonth(0);
                }

                if ( number > 2000 ) dateToCalculate.setFullYear(number);
                else if ( number < 20 ) {
                    dateToCalculate.setFullYear(now.getFullYear() - number);

                }
                break;
        }
        let investDate = formatDate(dateToCalculate);

        now.setDate(now.getDate() - 1);
        let sellDate = formatDate(now);

        let investment = await calculateInvestment(investDate, sellDate);

        let earned = formatMoney(investment.earned.toFixed(2));

        let response = 'Investment price on ' + dateToCalculate.toDateString() +
            ' was: ' + formatMoney(investment.investPrice.toFixed(2)) + '. ' +
            'With the investment of : ' + formatMoney(conv.data.bitcoinInvestment) + ' EURO ' +
            'you would buy ' + investment.startBitcoin.toFixed(2) + ' bitcoins. ' +
            'Selling price yesterday would be ' + formatMoney(investment.sellPrice.toFixed(2)) + ' EURO. ' +
            'If you sold your ' + investment.startBitcoin.toFixed(2) + ' of bitcoins' +
            ' you would have earned: ' + earned + ' euros ';

        conv.ask(response);
        conv.ask(new BasicCard({
            text: `Bitcoin price on ${dateToCalculate.toDateString()}: ${formatMoney(investment.investPrice.toFixed(2))}.  \n
Investment: ${formatMoney(conv.data.bitcoinInvestment)} euro.  \n  
Selling price yesterday: ${formatMoney(investment.sellPrice.toFixed(2))} euro.  \n   
Revenue: ${earned} euros.  \n`,
            subtitle: `Investment date: ${dateToCalculate.toDateString()}`,
            title: `Investment return: ${earned} euros`,
            buttons: new Button({
                title: 'Buy bitcoins now',
                url: 'https://bitcoins.now/',
            }),
            display: 'CROPPED',
        }));
        agent.add(conv);
    }

    function formatMoney(num) {
        return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
    }

    function formatDate(date) {
        let month = date.getMonth() + 1;
        if ( month < 10 ) month = '0' + month;
        let day = date.getDate();
        if ( day < 10 ) day = '0' + day;
        return date.getFullYear() + "-" + month + "-" + day;
    }


    async function calculateInvestment(investDate, sellDate) {

        let investPrice = await getBitcoinPrice(investDate);
        let sellPrice = await getBitcoinPrice(sellDate);

        let startBitcoin = conv.data.bitcoinInvestment / investPrice;
        let earned = startBitcoin * sellPrice - conv.data.bitcoinInvestment;

        return {
            investPrice,
            sellPrice,
            startBitcoin,
            earned
        };
    }

    function getBitcoinPrice(dateToRead) {
        if ( conv.data.bitcoinPrices.hasOwnProperty(dateToRead) )  {
            return conv.data.bitcoinPrices[dateToRead];
        } else {
            return requestAPI('https://api.coindesk.com/v1/bpi/historical/close.json?start=' + dateToRead+
                '&end=' + dateToRead + '&currency=eur')
                .then(function (data) {
                    let bitcoinPrice = JSON.parse(data);
                    if (bitcoinPrice.hasOwnProperty('bpi') && bitcoinPrice['bpi'].hasOwnProperty(dateToRead)) {
                        return bitcoinPrice['bpi'][dateToRead];
                    }

                }).catch(function (err) {
                    console.log('No bitcoin data');
                    console.log(err);
                });
        }

    }

    function formatDate(date) {
        let month = date.getMonth() + 1;
        if ( month < 10 ) month = '0' + month;
        let day = date.getDate();
        if ( day < 10 ) day = '0' + day;
        return date.getFullYear() + "-" + month + "-" + day;
    }

//   Run the proper function handler based on the matched Dialogflow intent name
    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('earn with bitcoin in specific period', earnWithBitcoinPeriod);
    intentMap.set('music vote', voting);
    intentMap.set('vote results', voteResults);
    intentMap.set('show meetups', showMeetups);
    intentMap.set('show meetups - next', nextMeetup);
    intentMap.set('show meetup list', listMeetups);
    intentMap.set('show meetup list - select.number', selectByNumberMeetup);
    intentMap.set('show meetups - previous', previousMeetup);
    intentMap.set('show meetups - repeat', repeatMeetup);
    intentMap.set('show meetup list - select.number - next', nextMeetup);
    intentMap.set('show meetup list - select.number - previous', previousMeetup);
    intentMap.set('show meetup list - select.number - repeat', repeatMeetup);
    intentMap.set('panic attacks', panicAttack);

//   intentMap.set('your intent name here', yourFunctionHandler);
//   intentMap.set('your intent name here', googleAssistantHandler);
    agent.handleRequest(intentMap);
});
