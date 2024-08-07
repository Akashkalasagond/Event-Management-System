const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const path = require("path");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Razorpay = require("razorpay");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "views")));

// Setup session middleware
app.use(
  session({
    secret: "secret",
    resave: false,
    saveUninitialized: true,
  })
);

// Initialize passport middleware
app.use(passport.initialize());
app.use(passport.session());

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

// Define mongoose schema for event
const eventSchema = new mongoose.Schema({
  eventName: String,
  eventDescription: String,
  eventType: String,
  capacity: Number,
  startDateTime: Date,
  endDateTime: Date,
  ticketPrice: Number,
  venueDetails: String,
  eventImage: String,
});

const Event = mongoose.model("Event", eventSchema);

// Serialize user into session
passport.serializeUser(function (user, done) {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async function (id, done) {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID";
const GOOGLE_CLIENT_SECRET = "YOUR_GOOGLE_CLIENT_SECRET";

// Configure Google OAuth strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/callback",
    },
    async function (accessToken, refreshToken, profile, done) {
      try {
        let user = await User.findOne({ email: profile.emails[0].value });

        if (!user) {
          user = new User({
            name: profile.displayName,
            email: profile.emails[0].value,
            role: "user",
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

// Initialize Razorpay instance with your API key and secret
const razorpay = new Razorpay({
  key_id: "rzp_test_L0NVLagBVHWSaj",
  key_secret: "XQX9t7RiF5fQDz5ndwAFZKXL",
});

// Route handler for creating an order
app.post("/create_order", async (req, res) => {
  try {
    const { eventName, eventPrice } = req.body;

    // Create an order using Razorpay API
    const order = await razorpay.orders.create({
      amount: eventPrice * 100, // Amount should be in paise
      currency: "INR",
      receipt: "receipt_order_123", // Generate a unique receipt ID
      payment_capture: 1,
    });

    // Send the order ID to the client
    res.json({ id: order.id, amount: order.amount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

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
      venueDetails,
      eventImage,
    } = req.body;

    const newEvent = new Event({
      eventName,
      eventDescription,
      eventType,
      capacity,
      startDateTime,
      endDateTime,
      ticketPrice,
      venueDetails,
      eventImage,
    });

    await newEvent.save();

    res.status(200).send({ message: "Event saved successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal server error." });
  }
});

// Route handler to fetch events
app.get("/events", async (req, res) => {
  try {
    // Query the MongoDB collection to fetch all events
    const events = await Event.find({});
    res.json(events);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
