'use strict';

let config = require('config');
let log = require('npmlog');

let express = require('express');
let bodyParser = require('body-parser');
let path = require('path');
let favicon = require('serve-favicon');
let logger = require('morgan');
let cookieParser = require('cookie-parser');
let session = require('express-session');
let RedisStore = require('connect-redis')(session);
let flash = require('connect-flash');
let hbs = require('hbs');
let compression = require('compression');
let auth = require('basic-auth');
const humanize = require('humanize');

let routes = require('./routes/index');

let app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// Handle proxies. Needed to resolve client IP
if (config.proxy) {
    app.set('trust proxy', config.proxy);
}

// Do not expose software used
app.disable('x-powered-by');

/**
 * We need this helper to make sure that we consume flash messages only
 * when we are able to actually display these. Otherwise we might end up
 * in a situation where we consume a flash messages but then comes a redirect
 * and the message is never displayed
 */
hbs.registerHelper('flash_messages', function () { // eslint-disable-line prefer-arrow-callback
    if (typeof this.flash !== 'function') { // eslint-disable-line no-invalid-this
        return '';
    }

    let messages = this.flash(); // eslint-disable-line no-invalid-this
    let response = [];

    // group messages by type
    Object.keys(messages).forEach(key => {
        let el = '<div class="alert alert-' + key + ' alert-dismissible" role="alert"><button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>';

        if (key === 'danger') {
            el += '<span class="glyphicon glyphicon-exclamation-sign" aria-hidden="true"></span> ';
        }

        let rows = [];

        messages[key].forEach(message => {
            rows.push(hbs.handlebars.escapeExpression(message));
        });

        if (rows.length > 1) {
            el += '<p>' + rows.join('</p>\n<p>') + '</p>';
        } else {
            el += rows.join('');
        }

        el += '</div>';

        response.push(el);
    });

    return new hbs.handlebars.SafeString(
        response.join('\n')
    );
});

hbs.registerHelper('num', function (options) { // eslint-disable-line prefer-arrow-callback
    return new hbs.handlebars.SafeString(
        humanize.numberFormat(options.fn(this), 0, ',', ' ') // eslint-disable-line no-invalid-this
    );
});

hbs.registerHelper('dec', function (options) { // eslint-disable-line prefer-arrow-callback
    return new hbs.handlebars.SafeString(
        humanize.numberFormat(options.fn(this), 3, ',', ' ') // eslint-disable-line no-invalid-this
    );
});

app.use(compression());
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

app.use(logger(config.httplog, {
    stream: {
        write: message => {
            message = (message || '').toString();
            if (message && process.NODE_ENV !== 'production') {
                log.info('HTTP', message.replace('\n', '').trim());
            }
        }
    }
}));

app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    store: new RedisStore(config.redis),
    secret: config.secret,
    saveUninitialized: false,
    resave: false
}));
app.use(flash());

app.use(bodyParser.urlencoded({
    extended: true,
    limit: config.maxPostSize
}));

app.use(bodyParser.text({
    limit: config.maxPostSize
}));

app.use(bodyParser.json({
    limit: config.maxPostSize
}));

// make sure flash messages are available
app.use((req, res, next) => {
    res.locals.flash = req.flash.bind(req);

    let menu = [
        /*{
                title: 'Home',
                url: '/',
                selected: true
            }*/
    ];

    res.setSelectedMenu = key => {
        menu.forEach(item => {
            item.selected = (item.key === key);
        });
    };

    res.locals.menu = menu;

    next();
});

// setup HTTP auth
app.use((req, res, next) => {
    if (!config.auth) {
        return next();
    }
    let credentials = auth(req);
    if (!credentials || credentials.name !== config.user || credentials.pass !== config.pass) {
        res.statusCode = 401;
        res.setHeader('WWW-Authenticate', 'Basic realm="example"');
        res.end('Access denied');
    } else {
        next();
    }
});

app.use('/', routes);

app.use((err, req, res, next) => {
    if (!err) {
        return next();
    }
    res.status(err.statusCode || 500);
    res.render('error', {
        message: err.message,
        error: err
    });
});

module.exports = app;
