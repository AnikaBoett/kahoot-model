const express = require("express");
const model = require("./model");
const cors = require("cors");
const session = require("express-session");

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

app.use(
  session({
    secret:
      "jdflkadjflkenflkneaifn3i40138uruinflkani3ojroi1jlk1nlk1jl32kkldjlkan",
    saveUninitialized: true,
    resave: false,
  }),
);

app.use(
  cors({
    credentials: true,
    origin: function (origin, callback) {
      callback(null, origin);
    },
  }),
);

app.use(express.static("public"));

async function AuthMiddleware(request, response, next) {
  //Step one: Check if they have a session
  if(request.session && request.session.userID) {
    //Step two: Check if that session.userID connects to a user in our database
    let user = await model.User.findOne({_id: request.session.userID});
    if(!user) {
      return response.status(401).send("User does not exist");
    }
    request.user = user;
    next();
  } else {
    return response.status(401).send("Unauthenticated");
  }
}

app.post("/users", async (req, res) => {
  try {
    let newUser = await new model.User({
      email: req.body.email,
      name: req.body.name,
    });

    // set password to hash
    await newUser.setPassword(req.body.password);

    //server-side validation
    const error = await newUser.validateSync();
    if (error) {
      console.log(error);
      return res.status(422).send(error);
    }

    await newUser.save();

    res.status(201).send("New user created.");
  } catch (error) {
    console.log(error);
    res.status(500).send(error);
  }
});

app.get("/users", async (req, res) => {
  try {
    let users = await model.User.find({}, { password: 0 });
    res.send(users);
  } catch (error) {
    res.status(404).send("Users not found.");
  }
});

app.get("/session", (request, response) => {
  response.send(request.session);
});

// logging in
app.post("/session", async (request, response) => {
  try {
    // STEP 1 find the user via their email
    let user = await model.User.findOne({ email: request.body.email });
    //STEP 2 if the user sends a email not in the database
    if (!user) {
      return response.status(401).send("Authentication failure");
    }

    // STEP 3 Check if they gave us the right password
    let isGoodPassword = await user.verifyPassword(request.body.password);
    if (!isGoodPassword) {
      return response.status(401).send("Authentication failure");
    }

    // Now we need to set the cookie
    request.session.userID = user._id;
    request.session.name = user.name;
    response.status(201).send(request.session);
    //response.status(201).send("You're logged in!");
  } catch (error) {
    response.status(500);
    console.log(error);
  }
});

app.post("/quizzes", async function (req, res) {
  try {
    const newQuiz = new model.Quiz({
      title: req.body.title,
      description: req.body.description,
      questions: req.body.questions,
      owner: req.session.userID,
    });

    const error = await newQuiz.validateSync();
    if (error) {
      res.status(422).send(error);
      console.log(error);
      return;
    }

    await newQuiz.save();
    res.status(201).send("Created quiz.");
  } catch (error) {
    console.error(error);
    res.status(422).send(error);
  }
});

//Put request for a single quiz
app.put("/quizzes/:quidID", AuthMiddleware, async function (request, response) {
  try { 
    //First, find the quiz
    let quiz = await model.Quiz.findOne({
      _id: request.params.quizID,
      owner: request.user._id,
    }).populate("owner");
    
    //If the quiz does not exist, return immediately
    if (!quiz) {
      response.status(404).send("Unable to find quiz");
      return;
    }

    console.log(request.user._id_);
    console.log(quiz.owner._id);
    //If the user is not the owner of the quiz, do not allow them to access it.
    if (request.user._id.toString() !== quiz.owner._id.toString()) {
      response.status(403).send("Not Authenticated");
      return;
    }

    quiz.title = request.body.title;
    quiz.description = request.body.description;
    quiz.questions = request.body.questions;

    const error = await quiz.validateSync();
    if (error) {
      response.send(422).send(error);
      return;
    }
    await quiz.save();
    response.status(204).send();
  } catch (error) {
    console.log(error);
    response.status(422).send(error);
  }
});

//DELETE for a single Quiz
app.delete("/quizzes/:quizID", AuthMiddleware, async function (request, response) {
  try {
    let isDeleted = await model.Quiz.findOneAndDelete({
      _id: request.params.quizID,
      owner: request.user._id,
    }).populate("owner");

    //check if the quiz is located
    if (!isDeleted) {
      response.status(404).send("Unable to find quiz for deletion");
      return;
    }
    response.status(204).send("Removed");
  } catch (error) {
    console.log(error);
    response.status(500).send(error);
  }
});

app.delete("/session", function (request, response) {
  request.session.userID = undefined;
//  request.session.name = undefined;
  response.status(204).send();
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}...`);
});