'use strict';

const express = require("express");
const passport = require("passport");
const APIStrategy = require("ibmcloud-appid").APIStrategy;

const app = (module.exports = express());

app.get('/health', (req, res, next) => {
    return res.status(200).send({"status":"UP"});
});

if (process.env.NODE_ENV !== "dev" && process.env.NODE_ENV !== "test") {
    app.use(passport.initialize());
    passport.use(new APIStrategy({
        oauthServerUrl: process.env.APPID_OAUTH_SERVER_URL
    }));
    passport.serializeUser(function (user, cb) {
        cb(null, user);
    });
    passport.deserializeUser(function (obj, cb) {
        cb(null, obj);
    });

    app.use(passport.authenticate(APIStrategy.STRATEGY_NAME, {
        session: false,
        scope: "appid_authenticated"
    }));

    const editorMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
    app.use((req, res, next) => {
        if (!editorMethods.includes(req.method) || req?.appIdAuthorizationContext?.accessTokenPayload?.scope?.split(" ").includes("edit")) {
            next();
        } else {
            res.status(401).json({
                error: {
                    message: "You must have editor role to perform this request."
                }
            });
        }
    });
}