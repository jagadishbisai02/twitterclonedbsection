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

    if (password.length < 5) {
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
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "My_Secrete");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

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

//tweet feed API-3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const userDetails = `
    SELECT 
    username, tweet, date_time As dateTime 
    FROM 
    follower INNER JOIN tweet ON following.following_user_id = tweet.user_id INNER JOIN user ON user.user_id = follower.following_user_id
    WHERE 
    follower.follower_user_id = ${user_id}
    ORDER BY 
    date_time DESC
    LIMIT 4;`;
  const tweetQuery = await db.all(userDetails);
  response.send(tweetQuery);
});

//API-4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const userDetails = `
    SELECT 
        name 
    FROM 
        user INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE 
        follower.follower_user_id = ${user_id};`;
  const userFollower = await db.all(userDetails);
  response.send(userFollower);
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
        follower.follower_user_id = ${user_id};`;
  const userFollower = await db.all(userDetails);
  response.send(userFollower);
});

//API-6
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getTweetQuery = `
    SELECT 
        *
    FROM 
        tweet
    WHERE 
        tweet_id = ${tweetId};`;
  const tweetQuery = await db.all(getTweetQuery);

  //
  const userDetails = `
    SELECT 
        name 
    FROM 
        user INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE 
        follower.follower_user_id = ${user_id};`;
  const userFollower = await db.all(userDetails);

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
      tweet.tweet_id = ${tweetId} AND tweet.user_id = ${userFollower[0].id};`;
    const tweetDetails = await db.all(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API-7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const getLikeUserQuery = `
    SELECT 
        *
    FROM 
        follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id 
        INNER JOIN like ON like.tweet_id = tweet.tweet_id 
        INNER JOIN user ON user.user_id = like.user_id
    WHERE 
        tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`;
    const likedUser = await db.all(getLikeUserQuery);
    if (likedUser.length !== 0) {
      let likes = [];
      const getNameArray = (likedUser) => {
        for (let item of likedUser) {
          likes.push(item.username);
        }
      };
      getNameArray(likedUser);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//replies API-8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const getReplyUserQuery = `
    SELECT 
        *
    FROM 
        follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id 
        INNER JOIN reply ON reply.tweet_id = tweet.tweet_id 
        INNER JOIN user ON user.user_id = reply.user_id
    WHERE 
        tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`;
    const repliedUser = await db.all(getLikeUserQuery);
    if (repliedUser.length !== 0) {
      let replies = [];
      const getNameArray = (repliedUser) => {
        for (let item of repliedUser) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getNameArray(repliedUser);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API-9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getTweetDetailsQuery = `
      SELECT 
      tweet.tweet AS tweet,
      COUNT(DISTINCT(like.like_id)) AS likes,
      COUNT(DISTINCT(reply.reply_id)) AS replies,
      tweet.date_time AS dateTime
      FROM 
      user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
      WHERE 
      user.user_id = ${user_id}
      GROUP BY
      tweet.tweet_id;`;
  const tweetDetails = await db.all(getTweetDetailsQuery);
  response.send(tweetDetails);
});

//API-10
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request;
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const postTweetQuery = `
      INSERT INTO 
      tweet (tweet, user_id)
      VALUES(
          '${tweet}'
          ${user_id}
      );`;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

//API-11
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const selectedUserQuery = `
      SELECT *
      FROM tweet 
      WHERE 
      tweet.user_id=${user_id} AND tweet.tweet_id = ${tweetId};`;
  const tweetUser = await bd.all(selectedUserQuery);
  if (tweetUser.length !== 0) {
    const deleteTweetQuery = `DELETE FROM tweet
    WHERE 
    tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId}`;
    await db.run(deleteTweetQuery);
    response.send("Deleted a Tweet");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
module.exports = app;