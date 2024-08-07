// Require necessary modules
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const path = require("path");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Razorpay = require("razorpay");
const dotenv = require("dotenv");

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Load environment variables from .env file
dotenv.config();

// Setup session middleware
app.use(
  session({
    secret: "secret",
    resave: false,
    saveUninitialized: true,
  })
);

// Connect to MongoDB
mongoose
  .connect("mongodb://127.0.0.1/signupDB", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));

// Define mongoose schema for user
const userSchema = new mongoose.Schema({
  name: String,
  email: {
    type: String,
    unique: true,
    required: true,
    match: /^\S+@\S+\.\S+$/,
  },
  password: {
    type: String,
    required: false,
    minlength: 6,
  },
  role: {
    type: String,
    default: "user",
  },
});

const User = mongoose.model("User", userSchema);

// Serialize and deserialize user for sessions
passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(async function (id, done) {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Initialize Razorpay client
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Middleware for parsing JSON bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Route to initiate payment
app.post("/create-payment", (req, res) => {
  const { amount, currency, receipt, notes } = req.body;

  razorpay.orders.create(
    {
      amount: amount * 100,
      currency: currency,
      receipt: receipt,
      notes: notes,
    },
    (err, order) => {
      if (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
      } else {
        res.json(order);
      }
    }
  );
});

// Route to handle payment success callback
app.post("/payment-success", (req, res) => {
  // Handle payment success callback here
  // You can update your database, send confirmation emails, etc.
  res.json({ message: "Payment successful" });
});

const GOOGLE_CLIENT_ID =
  "546288921587-51iu41glj5hc748t0egkpm51ntsg2012.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = "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";
passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/callback",
    },
    async function (accessToken, refreshToken, profile, done) {
      try {
        // Check if the user already exists in the database
        let user = await User.findOne({ email: profile.emails[0].value });

        // If user does not exist, create a new user
        if (!user) {
          user = new User({
            name: profile.displayName,
            email: profile.emails[0].value,
            role: "user", // Set role to "user"
          });

          await user.save();
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  function (req, res) {
    // Successful authentication, redirect to userdashboard.html or userdashboard route
    res.redirect("/userdashboard");
  }
);
app.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if all required fields are provided
    if (!name || !email || !password) {
      return res
        .status(400)
        .send({ message: "Name, email, and password are required." });
    }

    const newUser = new User({
      name,
      email,
      password,
    });

    await newUser.save();

    res.status(200).send({ message: "Signup successful." });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal server error." });
  }
});
app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "signup.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "login.html"));
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user || user.password !== password) {
      return res.status(401).send({ message: "Invalid email or password." });
    }

    req.session.user = user;

    res.status(200).send({ message: "Login successful.", role: user.role });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal server error." });
  }
});

app.get("/dashboard", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "dashboard.html"));
});

function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === "admin") {
    next();
  } else {
    res
      .status(403)
      .send("Only admin users are allowed to access this resource.");
  }
}
app.get("/userdashboard", requireUser, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "userdashboard.html"));
});

function requireUser(req, res, next) {
  if ((req.session.user && req.session.user.role === "user") || req.user) {
    next();
  } else {
    res.status(403).send("Only users are allowed to access this resource.");
  }
}

app.post("/save-event", async (req, res) => {
  try {
    const {
      eventName,
      eventDescription,
      eventType,
      capacity,
      startDateTime,
      endDateTime,
      ticketPrice,
    } = req.body;

    const newEvent = new Event({
      eventName,
      eventDescription,
      eventType,
      capacity,
      startDateTime,
      endDateTime,
      ticketPrice,
    });

    await newEvent.save();

    res.status(200).send({ message: "Event saved successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal server error." });
  }
});
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  function (req, res) {
    // Successful authentication, redirect to userdashboard.html
    res.redirect("/userdashboard");
  }
);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Serve static files from the 'views' directory
app.use(express.static(path.join(__dirname, "views")));

// Routes for signup, login, dashboard, etc.
// Add your existing routes here

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
