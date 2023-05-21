const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//Authorization
const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "My_Secrete", (error, payload) => {
      if (error) {
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweetId = tweetId;
        request.tweet = tweet;
        next();
      }
    });
  }
};

//
const getFollowingPeopleIdsOfUser = async (username) => {
  const getTheFollowingPeopleQuery = `SELECT 
    follower_user_id
    FROM
    follower INNER JOIN user ON user.user_id = follower.follower_user_id
    WHERE
    user.username='${username}';`;
  const followingPeople = await db.all(getTheFollowingPeopleQuery);
  const followingIds = followingPeople.map(
    (eachUser) => eachUser.follower_user_id
  );
  return followingIds;
};

//create API User
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    const createUserQuery = `
      INSERT INTO 
      user(username, password, name, gender)
      VALUES(
          '${username}',
          '${password}',
          '${name}',
          '${gender}'
      );`;

    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//user login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username, userId: 1 };
      const jwtToken = jwt.sign(payload, "My_Secrete");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//tweet feed API-3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request.payload;
  const followingIds = await getFollowingPeopleIdsOfUser(username);
  try {
    const getTweetsQuery = `
    SELECT
    username, tweet, date_time AS dateTime
    FROM
    user
    INNER JOIN tweet
    ON user.user_id = tweet.user_id
    WHERE
    user.user_id IN (${followingIds})
    ORDER BY
    tweet.date_time DESC
    LIMIT 4;`;
    const tweetQuery = await db.all(getTweetsQuery);
    response.send(tweetQuery);
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
  }
});

//API-4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request.payload;
  const followingIds = await getFollowingPeopleIdsOfUser(username);
  try {
    const userDetails = `
    SELECT 
        name 
    FROM 
        follower INNER JOIN user ON user.user_id = follower.follower_user_id
    WHERE 
        follower.following_user_id = '${followingIds}';`;
    const userFollower = await db.all(userDetails);
    response.send(userFollower);
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
  }
});

//API-5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const userDetails = `
    SELECT 
        name 
    FROM 
        user INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE 
        follower.follower_user_id = '${user_id}';`;
  const userFollower = await db.all(userDetails);
  response.send(userFollower);
});

//API-6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(tweetId);
  const getTweetQuery = `
    SELECT 
        *
    FROM 
        tweet
    WHERE 
        tweet_id = '${tweetId}';`;
  const tweetQuery = await db.all(getTweetQuery);
  console.log(tweetQuery);

  //
  const userDetails = `
    SELECT 
        name 
    FROM 
        user INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE 
        follower.follower_user_id = '${user_id}';`;
  const userFollower = await db.all(userDetails);
  console.log(userFollower);

  //
  if (
    userFollower.some((item) => item.following_user_id === tweetQuery.user_id)
  ) {
    const getTweetDetailsQuery = `
      SELECT 
      tweet,
      COUNT(DISTINCT(like.like_id)) AS likes,
      COUNT(DISTINCT(reply.reply_id)) AS replies,
      tweet.date_time AS dateTime
      FROM 
      tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
      WHERE 
      tweet.tweet_id = '${tweetId}' AND tweet.user_id = '${userFollower[0].id}';`;
    const tweetDetails = await db.all(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
