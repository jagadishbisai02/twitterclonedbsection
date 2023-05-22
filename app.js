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
        response.status(401);
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
/*const getFollowingPeopleIdsOfUser = async (username) => {
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
};*/

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
      const jwtToken = jwt.sign(dbUser, "My_Secrete");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//tweet feed API-3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { username, gender, name, user_id } = payload;
  try {
    const getTweetsQuery = `
    SELECT
    username, tweet, date_time AS dateTime
    FROM
    user
    INNER JOIN tweet
    ON user.user_id = tweet.user_id
    WHERE
    user.user_id IN (${user_id})
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
  const { payload } = request;
  const { username, gender, name, user_id } = payload;
  try {
    const userDetails = `
    SELECT 
        name 
    FROM 
        follower INNER JOIN user ON user.user_id = follower.follower_user_id
    WHERE 
        follower.following_user_id = '${user_id}';`;
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
        user INNER JOIN follower ON user.user_id = follower.follower_user_id
    WHERE 
        follower.following_user_id = '${user_id}';`;
  const userFollower = await db.all(userDetails);
  response.send(userFollower);
});

//API-6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
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
        * 
    FROM 
        follower INNER JOIN user ON user.user_id = follower.following_user_id
    WHERE 
        follower.follower_user_id = '${user_id}';`;
  const userFollower = await db.all(userDetails);
  //
  if (
    userFollower.some(
      (item) => item.following_user_id === tweetQuery[0].user_id
    )
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
      tweet.tweet_id = '${tweetId}' AND tweet.user_id = '${userFollower[0].user_id}';`;
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
    try {
      const getLikeUserQuery = `
    SELECT 
        *
    FROM 
        follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id 
        INNER JOIN like ON like.tweet_id = tweet.tweet_id 
        INNER JOIN user ON user.user_id = like.user_id
    WHERE 
        tweet_id = '${tweetId}' AND follower.follower_user_id = '${user_id}';`;
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
    } catch (e) {
      console.log(`DB Error: ${e.message}`);
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
    try {
      const getReplyUserQuery = `
    SELECT 
        *
    FROM 
        follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id 
        INNER JOIN reply ON reply.tweet_id = tweet.tweet_id 
        INNER JOIN user ON user.user_id = reply.user_id
    WHERE 
        tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`;
      const repliedUser = await db.all(getReplyUserQuery);
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
    } catch (e) {
      console.log(`DB Error: ${e.message}`);
    }
  }
);

//API-9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
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
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  try {
    const postTweetQuery = `
      INSERT INTO 
      tweet (tweet)
      VALUES(
          '${tweet}'
      );`;
    await db.run(postTweetQuery);
    response.send("Created a Tweet");
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
  }
});

//API-11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    try {
      const selectedUserQuery = `
      SELECT *
      FROM tweet 
      WHERE 
      tweet.user_id='${user_id}' AND tweet.tweet_id = '${tweetId}';`;
      const tweetUser = await bd.all(selectedUserQuery);
      if (tweetUser.length !== 0) {
        const deleteTweetQuery = `DELETE FROM tweet
    WHERE 
    tweet.user_id = '${user_id}' AND tweet.tweet_id = '${tweetId}'`;
        await db.run(deleteTweetQuery);
        response.send("Deleted a Tweet");
      } else {
        response.status(401);
        response.send("Invalid Request");
      }
    } catch (e) {
      console.log(`DB Error: ${e.message}`);
    }
  }
);

module.exports = app;
