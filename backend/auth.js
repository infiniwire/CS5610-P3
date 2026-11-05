import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import MongoStore from "connect-mongo";
import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import session from "express-session";
import { ObjectId } from "mongodb";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";

const scryptAsync = promisify(scrypt);
const scryptOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const emptyPasswordHash = { salt: "0".repeat(32), hash: "0".repeat(128) };
const cookieName = "paperpulse.sid";
const sessionLifetime = 7 * 24 * 60 * 60;

function passwordKey(password, salt) {
  return scryptAsync(password, Buffer.from(salt, "hex"), 64, scryptOptions);
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await passwordKey(password, salt);
  return { salt, hash: key.toString("hex") };
}

function publicUser(user) {
  return { id: user._id.toHexString(), email: user.email };
}

function requireJson(req, res, next) {
  if (!req.is("application/json")) {
    return res.status(415).json({ error: "Use an application/json request." });
  }
  return next();
}

function validateCredentials(req, res, next) {
  const { email, password } = req.body ?? {};
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Use a password between 8 and 128 characters." });
  }

  req.body = { email: normalizedEmail, password };
  return next();
}

function signIn(req, res, next, user, status = 200) {
  req.logIn(user, (error) => {
    if (error) return next(error);
    return res.status(status).json({ user: publicUser(user) });
  });
}

function createAuthRouter(auth, users, cookie) {
  const router = Router();
  const limitAttempts = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many attempts. Try again later." },
  });
  const credentials = [limitAttempts, requireJson, express.json({ limit: "8kb" }), validateCredentials];

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get("/me", (req, res) => {
    res.json({ user: req.user ? publicUser(req.user) : null });
  });

  router.post("/register", ...credentials, async (req, res, next) => {
    const { email, password } = req.body;
    const user = { email, passwordHash: await hashPassword(password), createdAt: new Date() };

    try {
      const { insertedId } = await users.insertOne(user);
      signIn(req, res, next, { _id: insertedId, email }, 201);
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ error: "An account already exists for this email." });
      }
      return next(error);
    }
  });

  router.post("/login", ...credentials, (req, res, next) => {
    auth.authenticate("local", (error, user) => {
      if (error) return next(error);
      if (!user) return res.status(401).json({ error: "Email or password is incorrect." });
      return signIn(req, res, next, user);
    })(req, res, next);
  });

  router.post("/logout", requireJson, (req, res, next) => {
    req.logout((error) => {
      if (error) return next(error);
      req.session.destroy((destroyError) => {
        if (destroyError) return next(destroyError);
        res.clearCookie(cookieName, cookie);
        return res.json({ user: null });
      });
    });
  });

  router.use((error, _req, res, _next) => {
    if (error.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Invalid JSON request." });
    }
    if (error.type === "entity.too.large") {
      return res.status(413).json({ error: "Request is too large." });
    }
    console.error(`Authentication request failed (${error.name}).`);
    return res.status(500).json({ error: "Could not complete the authentication request." });
  });

  return router;
}

export async function configureAuth(app, client, secret) {
  const db = app.locals.db;
  const users = db.collection("users");
  await Promise.all([
    users.createIndex({ email: 1 }, { unique: true }),
    db.collection("sessions").createIndex({ expires: 1 }, { expireAfterSeconds: 0 }),
  ]);

  const auth = new passport.Passport();
  auth.use(new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
    try {
      const user = await users.findOne({ email }, { projection: { email: 1, passwordHash: 1 } });
      const { salt, hash } = user?.passwordHash ?? emptyPasswordHash;
      const candidate = await passwordKey(password, salt);
      const matches = timingSafeEqual(candidate, Buffer.from(hash, "hex"));
      return done(null, matches && user ? user : false);
    } catch (error) {
      return done(error);
    }
  }));

  auth.serializeUser((user, done) => done(null, user._id.toHexString()));
  auth.deserializeUser(async (id, done) => {
    try {
      const user = ObjectId.isValid(id)
        ? await users.findOne({ _id: new ObjectId(id) }, { projection: { email: 1 } })
        : null;
      return done(null, user ?? false);
    } catch (error) {
      return done(error);
    }
  });

  const secure = process.env.NODE_ENV === "production" || Boolean(process.env.RAILWAY_ENVIRONMENT_ID);
  if (secure) app.set("trust proxy", 1);
  const cookie = { httpOnly: true, sameSite: "lax", secure, path: "/" };
  app.use("/api", session({
    name: cookieName,
    secret,
    store: MongoStore.create({
      client,
      dbName: db.databaseName,
      autoRemove: "disabled",
      // The cookie expires at a fixed time, so reads need not extend the session.
      touchAfter: sessionLifetime,
    }),
    resave: false,
    saveUninitialized: false,
    cookie: { ...cookie, maxAge: sessionLifetime * 1000 },
  }), auth.initialize(), auth.session());
  app.use("/api/auth", createAuthRouter(auth, users, cookie));
}
