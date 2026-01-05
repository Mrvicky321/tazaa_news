const express = require("express");
const db = require("./db");
const app = express();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer");
const crypto = require("crypto");
require("dotenv").config();


app.use(express.json());
app.use(cors());




// ⭐ STATIC PUBLIC FOLDERS
app.use("/uploads/profile", express.static("uploads/profile"));
app.use("/uploads/posts", express.static("uploads/posts"));





//GET SINGLE USERS USING TOKEN

app.get("/api/user/profile", async (req, res) => {
    const token = req.headers.authorization;
    const secretKey = "asdfghjkl";

    if (!token) {
        return res.status(401).json({ message: "Token required" });
    }

    try {
        // Verify Token
        const decoded = jwt.verify(token, secretKey);
        const userId = decoded.id;

        // Get Profile info
        const [[user]] = await db.query(
            "SELECT id, name, username, email, bio, profile_image FROM users WHERE id=?",
            [userId]
        );

        // ⭐ ADD BASE URL
        const BASE_URL = "https://tazaa-news.onrender.com";

       
        user.profile_image = user.profile_image || null;

        // Followers Count
        const [[followers]] = await db.query(
            "SELECT COUNT(*) AS total FROM followers WHERE following_id=?",
            [userId]
        );

        // Following Count
        const [[following]] = await db.query(
            "SELECT COUNT(*) AS total FROM followers WHERE follower_id=?",
            [userId]
        );

        // Posts Count
        const [[posts]] = await db.query(
            "SELECT COUNT(*) AS total FROM posts WHERE user_id=?",
            [userId]
        );

        return res.json({
            user,
            stats: {
                followers: followers.total,
                following: following.total,
                posts: posts.total
            }
        });

    } catch (error) {
        console.log(error);
        return res.status(401).json({ message: "Invalid or expired token" });
    }
});






// SEARCH USERS WITH PROFILE STATS


app.get("/api/user/search", async (req, res) => {
    const search = req.query.q;  // frontend se q= keyword aayega
    const BASE_URL = "https://vibe.edugaondev.com";

    if (!search) {
        return res.status(400).json({ message: "Search query required" });
    }

    try {
        // 🔹 Get matching users
        const [users] = await db.query(
            `SELECT id, name, username, bio, profile_image 
             FROM users 
             WHERE name LIKE ? OR username LIKE ?`,
            [`%${search}%`, `%${search}%`]
        );

        // 🔹 Add stats + posts for each user
        const usersWithStats = await Promise.all(
            users.map(async (user) => {
                // Profile image full URL
                user.profile_image = user.profile_image || null;

                // Followers count
                const [[followers]] = await db.query(
                    "SELECT COUNT(*) AS total FROM followers WHERE following_id=?",
                    [user.id]
                );

                // Following count
                const [[following]] = await db.query(
                    "SELECT COUNT(*) AS total FROM followers WHERE follower_id=?",
                    [user.id]
                );

                // Posts count
                const [[postsCount]] = await db.query(
                    "SELECT COUNT(*) AS total FROM posts WHERE user_id=?",
                    [user.id]
                );

                // 🔹 Get posts with full image URL
                const [posts] = await db.query(
                    "SELECT id, caption, image FROM posts WHERE user_id=? ORDER BY id DESC",
                    [user.id]
                );

                const postsWithURL = posts.map(post => ({
                   ...post,
                   image: post.image || null
                 }));

                return {
                    ...user,
                    stats: {
                        followers: followers.total,
                        following: following.total,
                        posts: postsCount.total
                    },
                    posts: postsWithURL
                };
            })
        );

        res.json(usersWithStats);

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Search failed" });
    }
});






//  GET ALL USERS 
app.get("/api/user", async (request, response) => {
    const [result] = await db.query("SELECT * FROM users");
    response.status(200).json(result);
});


//  USER REGISTER 
app.post("/api/user/register", async (request, response) => {
    const name = request.body.name;
    const username = request.body.username;
    const email = request.body.email;
    const password = request.body.password;

    const passwordHash = await bcrypt.hash(password, 10);

    try {
        const [result] = await db.query(
            "INSERT INTO users(name, username, email, password) VALUES (?,?,?,?)",
            [name, username, email, passwordHash]
        );

        response.status(201).json({
            id: result.insertId,
            name: name,
            username: username,
            email: email
        });

    } catch (error) {
        console.log("Database INSERT error: ", error);

        if (error.errno === 1062) {
            return response.status(409).json({ message: "This email address is already registered." });
        }

        return response.status(500).json({ message: "Server internal error. Could not register user." });
    }
});






//  USER LOGIN 

app.post("/api/user/login", async (req, res) => {
    const { email, password } = req.body;
    const secretKey = "asdfghjkl";
    const refreshSecret = "refresh_secret_key";

    try {
        const [result] = await db.query("SELECT * FROM users WHERE email=?", [email]);

        if (result.length === 0) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const user = result[0];
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // Access Token (30 days)
        const accessToken = jwt.sign(
            { id: user.id },
            secretKey,
            { expiresIn: "30d" }
        );

        // Refresh Token (365 days)
        const refreshToken = jwt.sign(
            { id: user.id },
            refreshSecret,
            { expiresIn: "365d" }
        );

        // Save refresh token in DB
        await db.query("INSERT INTO refresh_tokens (user_id, token) VALUES (?, ?)", [
            user.id,
            refreshToken
        ]);

       res.json({
          message: "Login successful",
          user: {
             id: user.id,
             name: user.name,
             username: user.username,
             email: user.email
            },
         accessToken,
         refreshToken
       });


    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal server error" });
    }
});






//refresh token

app.post("/api/token/refresh", async (req, res) => {
    const { refreshToken } = req.body;

    // Missing token
    if (!refreshToken) {
        return res.status(400).json({ message: "Refresh token required" });
    }

    const refreshSecret = "refresh_secret_key";
    const secretKey = "asdfghjkl";

    try {
        // Check refresh token exists in DB
        const [rows] = await db.query(
            "SELECT * FROM refresh_tokens WHERE token=?",
            [refreshToken]
        );

        if (rows.length === 0) {
            return res.status(403).json({ message: "Invalid refresh token" });
        }

        // Verify refresh token
        jwt.verify(refreshToken, refreshSecret, (err, user) => {
            if (err) return res.status(403).json({ message: "Expired refresh token" });

            const newAccessToken = jwt.sign(
                { id: user.id },
                secretKey,
                { expiresIn: "1h" }
            );

            res.json({
                accessToken: newAccessToken
            });
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server error" });
    }
});





//logout api

app.post("/api/user/logout", async (req, res) => {
    const { refreshToken } = req.body;

    await db.query("DELETE FROM refresh_tokens WHERE token=?", [refreshToken]);

    res.json({ message: "Logged out successfully" });
});








//send otp api

app.post("/api/auth/send-otp", async (request, response) => {
    const email = request.body.email;

    try {
        // Validation
        if (!email) {
            return response.status(400).json({
                message: "Email is required",
            });
        }

        // Generate random 6-digit OTP
        const otp = crypto.randomInt(100000, 999999).toString();

        // Save OTP in DB
        await db.query(
            "INSERT INTO password_reset_otps (email, otp) VALUES (?, ?)",
            [email, otp]
        );

        // TODO: Send OTP email (optional, if needed)
        console.log("Generated OTP:", otp);

        // Success Response
        response.status(200).json({
            message: "OTP sent successfully",
            email: email,
            otp: otp, // show in response for testing — remove in production
        });

    } catch (error) {
        console.error("Send OTP Error:", error);
        response.status(500).json({
            message: "Internal server error",
        });
    }
});






// reset password

app.post("/api/auth/reset-password", async (request, response) => {
    const { email, otp, newPassword } = request.body;

    try {

        // Validation
        if (!email || !otp || !newPassword) {
            return response.status(400).json({
                message: "email, otp & newPassword are required",
            });
        }

        // Check OTP
        const [otpRecord] = await db.query(
            "SELECT * FROM password_reset_otps WHERE email=? AND otp=? ORDER BY createdAt DESC LIMIT 1",
            [email, otp]
        );

        if (otpRecord.length === 0) {
            return response.status(400).json({
                message: "Invalid or expired OTP",
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update user password
        await db.query(
            "UPDATE users SET password=? WHERE email=?",
            [hashedPassword, email]
        );

        // Delete OTP after use
        await db.query(
            "DELETE FROM password_reset_otps WHERE email=?",
            [email]
        );

        // Success Response
        response.status(200).json({
            message: "Password reset successfully",
            email: email,
        });

    } catch (error) {
        console.error("Reset Password Error:", error);
        response.status(500).json({
            message: "Internal server error",
        });
    }
});






//  PROFILE UPDATE 

const profileStorage = multer.diskStorage({
    destination: "./uploads/profile",
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const uploadProfile = multer({ storage: profileStorage });

app.post("/api/profile/update", uploadProfile.single("profile"), async (request, response) => {
    const id = request.body.id;
    const name = request.body.name;
    const username = request.body.username;
    const bio = request.body.bio;

    const profileImg = request.file ? request.file.filename : null;

    await db.query(
        "UPDATE users SET name=?, username=?, bio=?, profile_image=? WHERE id=?",
        [name, username, bio, profileImg, id]
    );

    response.json({ message: "Profile Updated" });
});



//  CREATE POST 

const postStorage = multer.diskStorage({
    destination: "./uploads/posts",
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const uploadPost = multer({ storage: postStorage });

app.post("/api/posts/create", uploadPost.single("post"), async (request, response) => {
    const user_id = request.body.user_id;
    const caption = request.body.caption;
    const img = request.file.filename;

    await db.query(
        "INSERT INTO posts(user_id, caption, image) VALUES (?,?,?)",
        [user_id, caption, img]
    );

    response.json({ message: "Post Created" });
});



//  GET ALL POSTS 
app.get("/api/posts/all", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        posts.id,
        posts.user_id,
        posts.caption,
        posts.image,
        posts.created_at,
        users.name AS username,
        users.profilePic AS profile_image
      FROM posts
      JOIN users ON posts.user_id = users.id
      ORDER BY posts.id DESC
    `);

    res.json({
      success: true,
      posts: rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});


//delete post

app.post("/api/posts/delete", async (req, res) => {
  try {
    const { post_id } = req.body;

    // Delete related data first:
    await db.query("DELETE FROM likes WHERE post_id=?", [post_id]);
    await db.query("DELETE FROM comments WHERE post_id=?", [post_id]);
    await db.query("DELETE FROM saved_posts WHERE post_id=?", [post_id]);
    await db.query("DELETE FROM shares WHERE post_id=?", [post_id]);

    // Then delete post
    await db.query("DELETE FROM posts WHERE id=?", [post_id]);

    res.json({ message: "Post Deleted!" });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Delete failed", error });
  }
});




//get users post 

app.get("/api/posts/user/:user_id", async (req, res) => {
  try {
    const user_id = req.params.user_id;


    const [rows] = await db.query(
      "SELECT * FROM posts WHERE user_id=? ORDER BY id DESC",
      [user_id]
    );

    const response = rows.map(post => ({
     ...post,
     image: post.image || null
    }));

    res.json(response);

  } catch (error) {
    console.error(error);
    res.status(500).json([]);
  }
});




//get single post

app.get("/api/posts/single/:id", async (request, response) => {
    const post_id = request.params.id;

    const [rows] = await db.query(
        "SELECT * FROM posts WHERE id=?", 
        [post_id]
    );

    response.json(rows[0]);
});






//  SAVE POST 
app.post("/api/posts/save", async (request, response) => {
    const user_id = request.body.user_id;
    const post_id = request.body.post_id;

    await db.query(
        "INSERT INTO saved_posts(user_id, post_id) VALUES(?,?)",
        [user_id, post_id]
    );

    response.json({ message: "Post Saved!" });
});



//  GET SAVED POSTS 
app.get("/api/posts/saved/:user_id", async (request, response) => {
    const user_id = request.params.user_id;

    const [rows] = await db.query(
        "SELECT posts.* FROM saved_posts JOIN posts ON saved_posts.post_id = posts.id WHERE saved_posts.user_id=?",
        [user_id]
    );

    response.json(rows);
});



//unsave post

app.post("/api/posts/unsave", async (request, response) => {
    const user_id = request.body.user_id;
    const post_id = request.body.post_id;

    await db.query(
        "DELETE FROM saved_posts WHERE user_id=? AND post_id=?",
        [user_id, post_id]
    );

    response.json({ message: "Post Unsaved!" });
});





// add comment

app.post("/api/comment/add", async (req, res) => {
  const { post_id, user_id, comment } = req.body;

  await db.query(
    "INSERT INTO comments(post_id, user_id, comment) VALUES(?,?,?)",
    [post_id, user_id, comment]
  );

  const [[post]] = await db.query(
    "SELECT user_id FROM posts WHERE id=?",
    [post_id]
  );

  await createNotification({
    sender_id: user_id,
    receiver_id: post.user_id,
    type: "comment",
    post_id,
    message: "commented on your post"
  });

  res.json({ message: "Comment Added!" });
});





//get comment by post

app.get("/api/comment/:post_id", async (request, response) => {
    const post_id = request.params.post_id;

    const [rows] = await db.query(
        `SELECT comments.*, users.username, users.profile_image 
         FROM comments 
         JOIN users ON comments.user_id = users.id 
         WHERE comments.post_id=? ORDER BY comments.id DESC`,
        [post_id]
    );

    response.json(rows);
});




// update comment

app.post("/api/comment/update", async (req, res) => {
  try {
    const { comment_id, comment } = req.body;

    if (!comment_id || !comment) {
      return res.status(400).json({ message: "comment_id & comment are required" });
    }

    await db.query(
      "UPDATE comments SET comment=? WHERE id=?",
      [comment, comment_id]
    );

    res.json({ message: "Comment Updated!" });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Update failed", error });
  }
});





// delete comment

app.post("/api/comment/delete", async (req, res) => {
  try {
    const { comment_id } = req.body;

    if (!comment_id) {
      return res.status(400).json({ message: "comment_id required" });
    }

    await db.query(
      "DELETE FROM comments WHERE id=?",
      [comment_id]
    );

    res.json({ message: "Comment Deleted!" });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Delete failed", error });
  }
});









//like post

app.post("/api/posts/like", async (req, res) => {
  const { post_id, user_id } = req.body;

  const [[post]] = await db.query(
    "SELECT user_id FROM posts WHERE id=?",
    [post_id]
  );

  const [rows] = await db.query(
    "SELECT id FROM likes WHERE post_id=? AND user_id=?",
    [post_id, user_id]
  );

  if (rows.length > 0) {
    return res.json({ message: "Already liked" });
  }

  await db.query(
    "INSERT INTO likes(post_id, user_id) VALUES(?,?)",
    [post_id, user_id]
  );

  await createNotification({
    sender_id: user_id,
    receiver_id: post.user_id,
    type: "like",
    post_id,
    message: "liked your post"
  });

  res.json({ message: "Post liked" });
});





//already liked api get 

app.get("/api/posts/liked/:userId", async (req, res) => {
  const userId = req.params.userId;

  const [rows] = await db.query(
    "SELECT post_id FROM likes WHERE user_id=?",
    [userId]
  );

  res.json(rows.map(r => r.post_id));
});





//unlike post

app.post("/api/posts/unlike", async (request, response) => {
    const post_id = request.body.post_id;
    const user_id = request.body.user_id;

    await db.query(
        "DELETE FROM likes WHERE post_id=? AND user_id=?",
        [post_id, user_id]
    );

    response.json({ message: "Post Unliked!" });
});




//get like count

app.get("/api/posts/likes/:post_id", async (request, response) => {
    const post_id = request.params.post_id;

    const [rows] = await db.query(
        "SELECT COUNT(*) AS likes FROM likes WHERE post_id=?",
        [post_id]
    );

    response.json(rows[0]);
});






// get comment count by post_id

app.get("/api/posts/comments/count/:post_id", async (req, res) => {
  try {
    const post_id = req.params.post_id;

    const [rows] = await db.query(
      "SELECT COUNT(*) AS comments FROM comments WHERE post_id=?",
      [post_id]
    );

    res.json(rows[0]); // { comments: number }

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Failed to get comment count" });
  }
});








//count share post

app.post("/api/posts/share", async (request, response) => {
    const post_id = request.body.post_id;
    const user_id = request.body.user_id;

    await db.query(
        "INSERT INTO shares(post_id, user_id) VALUES(?,?)",
        [post_id, user_id]
    );

    response.json({ message: "Post Shared!" });
});




//follow user

app.post("/api/user/follow", async (req, res) => {
  const { follower_id, following_id } = req.body;

  await db.query(
    "INSERT INTO followers (follower_id, following_id) VALUES (?, ?)",
    [follower_id, following_id]
  );

  await createNotification({
    sender_id: follower_id,
    receiver_id: following_id,
    type: "follow",
    message: "started following you"
  });

  res.json({ message: "User Followed" });
});





//unfollow user

app.post("/api/user/unfollow", async (req, res) => {
  const { follower_id, following_id } = req.body;

  await db.query(
    "DELETE FROM followers WHERE follower_id=? AND following_id=?",
    [follower_id, following_id]
  );

  res.json({ message: "User Unfollowed" });
});




//get followers list

app.get("/api/user/followers/:user_id", async (req, res) => {
  const user_id = req.params.user_id;

  const [rows] = await db.query(
    "SELECT users.* FROM followers JOIN users ON followers.follower_id = users.id WHERE followers.following_id=?",
    [user_id]
  );

  res.json(rows);
});




//get following list

app.get("/api/user/following/:user_id", async (req, res) => {
  const user_id = req.params.user_id;

  const [rows] = await db.query(
    "SELECT users.* FROM followers JOIN users ON followers.following_id = users.id WHERE followers.follower_id=?",
    [user_id]
  );

  res.json(rows);
});


//********************************CHAT SYSTEM API***********************************//

// Send message
app.post("/api/chat/send", async (req, res) => {
  const { sender_id, receiver_id, message } = req.body;

  await db.query(
    "INSERT INTO messages(sender_id, receiver_id, message) VALUES (?,?,?)",
    [sender_id, receiver_id, message]
  );

  await createNotification({
    sender_id,
    receiver_id,
    type: "message",
    message: "sent you a message"
  });

  res.json({ message: "Message Sent" });
});







// Chat list (latest message first) with sender info
app.get("/api/chat/list/:user_id", async (req, res) => {
  const user_id = req.params.user_id;

  try {
    const [rows] = await db.query(
      `SELECT m.*, u.username, u.profile_image
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.sender_id=? OR m.receiver_id=?
       ORDER BY m.created_at DESC`,
      [user_id, user_id]
    );

    // Ensure profile_image is not null
    rows.forEach(r => {
      r.profile_image = r.profile_image || null;
    });

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to load chat list" });
  }
});





// Get messages between two users
app.get("/api/chat/messages", async (req, res) => {
  const { sender_id, receiver_id } = req.query;

  try {
    const [rows] = await db.query(
      `SELECT m.*, u.username, u.profile_image
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE (m.sender_id=? AND m.receiver_id=?) OR (m.sender_id=? AND m.receiver_id=?)
       ORDER BY m.created_at ASC`,
      [sender_id, receiver_id, receiver_id, sender_id]
    );

    rows.forEach(r => {
      r.profile_image = r.profile_image || null;
    });

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to load messages" });
  }
});


//    NOTIFICATION FUNCTION
const createNotification = async ({
  sender_id,
  receiver_id,
  type,
  post_id = null,
  message
}) => {
  if (sender_id === receiver_id) return;

  await db.query(
    `INSERT INTO notifications 
     (sender_id, receiver_id, type, post_id, message)
     VALUES (?,?,?,?,?)`,
    [sender_id, receiver_id, type, post_id, message]
  );
};




//  GET NOTIFICATION

app.get("/api/notifications/:user_id", async (req, res) => {
  const user_id = req.params.user_id;

  const [rows] = await db.query(
    `SELECT n.*, u.username, u.profile_image
     FROM notifications n
     JOIN users u ON u.id = n.sender_id
     WHERE n.receiver_id=?
     ORDER BY n.created_at DESC`,
    [user_id]
  );

  rows.forEach(n => {
    n.profile_image = n.profile_image || null;
  });

  res.json(rows);
});




// READ NOTIFICATION

app.post("/api/notifications/read", async (req, res) => {
  const { notification_id } = req.body;

  await db.query(
    "UPDATE notifications SET is_read=1 WHERE id=?",
    [notification_id]
  );

  res.json({ message: "Notification marked as read" });
});


//   UNREAD NOTIFICATION

app.get("/api/notifications/unread/:user_id", async (req, res) => {
  const user_id = req.params.user_id;

  const [[count]] = await db.query(
    "SELECT COUNT(*) AS total FROM notifications WHERE receiver_id=? AND is_read=0",
    [user_id]
  );

  res.json(count);
});











const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log("Tazaa News API running on port:", PORT);
});
