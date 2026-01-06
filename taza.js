const express = require("express");
const db = require("./db");
const app = express();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const e = require("express");
const path = require("path");
app.use(express.json());
const ACCESS_TOKEN_SECRET = "access_secret_123";
const REFRESH_TOKEN_SECRET = "refresh_secret_456";
require("dotenv").config();
// 3️⃣ PORT define
const PORT = process.env.PORT || 5000;





// ======================================================
// USER LIST 
// ======================================================
app.get("/api/user", async (request, response) => {
    const [result] =await db.query("SELECT * FROM users");
    response.status(200).json(result);
});

// ======================================================
// USER REGISTER 
// ======================================================
app.post("/api/user/register", async (request, response) => {
    const name = request.body.name;
    const email = request.body.email;
    const password = request.body.password;

    const passwordHash = await bcrypt.hash(password, 10);

    try {
        const [result] = await db.query(
            "INSERT INTO users(name, email, password) VALUES (?, ?, ?)",
            [name, email, passwordHash]
        );

        response.status(201).json({
            id: result.insertId,
            name: name,
            email: email,
            role: "user"
        });

    } catch (error) {
        if (error.errno === 1062) {
            return response.status(409).json({ message: "Email already registered" });
        }
        return response.status(500).json({ message: "Internal server error" });
    }
});

// ======================================================
// USER LOGIN
// ======================================================
app.post("/api/user/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const [rows] = await db.query(
            "SELECT * FROM users WHERE email=?",
            [email]
        );

        if (rows.length === 0) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // ACCESS TOKEN (SHORT)
        const accessToken = jwt.sign(
            { id: user.id, email: user.email },
            ACCESS_TOKEN_SECRET,
            { expiresIn: "15m" }
        );

        // REFRESH TOKEN (LONG)
        const refreshToken = jwt.sign(
            { id: user.id },
            REFRESH_TOKEN_SECRET,
            { expiresIn: "7d" }
        );

        // Save refresh token in DB
        await db.query(
            "UPDATE users SET refresh_token=? WHERE id=?",
            [refreshToken, user.id]
        );

        res.json({
            message: "Login successful",
            accessToken,
            refreshToken
        });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});
// refresh token endpoint


    app.post("/api/token/refresh", async (req, res) => {
    console.log("BODY =>", req.body);   // 👈 ADD THIS

    const { refreshToken } = req.body;


    if (!refreshToken) {
        return res.status(401).json({ message: "Refresh token required" });
    }

    try {
        // verify refresh token
        const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);

        const [[user]] = await db.query(
            "SELECT id FROM users WHERE id=? AND refresh_token=?",
            [decoded.id, refreshToken]
        );

        if (!user) {
            return res.status(403).json({ message: "Invalid refresh token" });
        }

        // generate new access token
        const newAccessToken = jwt.sign(
            { id: user.id },
            ACCESS_TOKEN_SECRET,
            { expiresIn: "15m" }
        );

        res.json({
            accessToken: newAccessToken
        });

    } catch (err) {
        res.status(403).json({ message: "Token expired or invalid" });
    }
});


//logout endpoint
app.post("/api/logout", async (req, res) => {
    const { user_id } = req.body;

    await db.query(
        "UPDATE users SET refresh_token=NULL WHERE id=?",
        [user_id]
    );

    res.json({ message: "Logged out successfully" });
});

// ======================================================
// GET ALL NEWS
// ======================================================
app.get("/api/news", async (req, res) => {
    try {
        const [result] = await db.query("SELECT * FROM news ORDER BY id DESC");
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: "Error fetching news" });
    }
});

// ======================================================
// GET SINGLE NEWS
// ======================================================
app.get("/api/news/:id", async (req, res) => {
    const newsId = req.params.id;
    try {
        const [result] = await db.query("SELECT * FROM news WHERE id=?", [newsId]);

        if (result.length === 0) {
            return res.status(404).json({ message: "News not found" });
        }

        res.status(200).json(result[0]);
    } catch (error) {
        res.status(500).json({ message: "Error fetching news" });
    }
});



// ======================================================
// GET CATEGORIES
// ======================================================
app.get("/api/categories", async (req, res) => {
    try {
        const [result] = await db.query("SELECT * FROM categories");
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: "Error fetching categories" });
    }
});

//=============================
// GET USER PROFILE
//=============================
app.get("/api/user/profile", async (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ message: "Token required" });
    }

    const token = authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : authHeader;

    try {
        const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);

        const [[user]] = await db.query(
            "SELECT id, name, email, profilePic FROM users WHERE id=?",
            [decoded.id]
        );

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({ user });

    } catch (error) {
        res.status(401).json({ message: "Invalid or expired token" });
    }
});






// ==========================
// PROFILE UPDATE
// ==========================
const profileStorage = multer.diskStorage({
  destination: "./profileImages", // folder path
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

const uploadProfile = multer({ storage: profileStorage });

app.post("/api/user/update-profile", uploadProfile.single("profilePic"), async (req, res) => {
  try {
    const id = req.body.id;
    const name = req.body.name;
    const email = req.body.email;
    const profilePic = req.file ? req.file.filename : null;

    if (!id) {
      return res.status(400).json({ message: "User id required" });
    }

    // Build dynamic query
    let fields = [];
    let values = [];

    if (name) {
      fields.push("name=?");
      values.push(name);
    }
    if (email) {
      fields.push("email=?");
      values.push(email);
    }
    if (profilePic) {
      fields.push("profilePic=?");
      values.push(profilePic);
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    values.push(id);
    const sql = `UPDATE users SET ${fields.join(", ")} WHERE id=?`;

    // Callback-free style using async/await
    await db.query(sql, values);

    res.status(200).json({
      message: "Profile updated successfully",
      profilePic: profilePic ? `profileImages/${profilePic}` : undefined,
    });

  } catch (err) {
    console.error("Server Error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});











//GET SINGLE USERS USING TOKEN

app.get("/api/user/profile", async (req, res) => {
    const authHeader = req.headers.authorization;
    const secretKey = "ghdfjjgi9ew8865w";
    

    if (!authHeader) {
        return res.status(401).json({ message: "Token required" });
    }

    const token = authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : authHeader;

    try {
        const decoded = jwt.verify(token, secretKey);
        const userId = decoded.id;

        const [[user]] = await db.query(
            "SELECT id, name, email, profilePic FROM users WHERE id=?",
            [userId]
        );

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({ user });

    } catch (error) {
        res.status(401).json({ message: "Invalid or expired token" });
    }
});

// ======================================================
// GET COMMENTS BY POST ID
// ======================================================


app.get("/api/comment/:post_id", async (req, res) => {
    const postId = req.params.post_id;

    try {
        const [rows] = await db.query(
          "SELECT c.id, c.comment, u.name FROM comments c JOIN users u ON c.user_id=u.id WHERE post_id=? ORDER BY c.id DESC",
          [postId]
        );

        res.status(200).json(rows);

    } catch (err) {
        res.status(500).json({ message: "Server Error" });
    }
});





app.post("/api/share", async (req, res) => {
    const { user_id, post_id } = req.body;

    try {
        await db.query(
            "INSERT INTO post_share(user_id, post_id) VALUES(?, ?)",
            [user_id, post_id]
        );

        res.status(201).json({ message: "Post Shared" });

    } catch (err) {
        res.status(500).json({ message: "Server Error" });
    }
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


//======================================================
// RESET PASSWORD API
//======================================================

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




//
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

// ======================================================
// GET ALL POSTS
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





// ======================================================
// DELETE POST
// ======================================================
app.post("/api/posts/delete", async (req, res) => {
  try {
    const { id } = req.body;   // <-- POST ID

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Post id is required"
      });
    }

    // Delete related data
    await db.query("DELETE FROM likes WHERE post_id=?", [id]);
    await db.query("DELETE FROM comments WHERE post_id=?", [id]);
    await db.query("DELETE FROM shares WHERE post_id=?", [id]);

    // Delete post
    const [result] = await db.query(
      "DELETE FROM posts WHERE id=?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Post not found"
      });
    }

    res.json({
      success: true,
      message: "Post deleted successfully"
    });

  } catch (error) {
    console.error("DELETE POST ERROR 👉", error);
    res.status(500).json({
      success: false,
      message: error.sqlMessage || error.message
    });
  }
});

// ======================================================
// DELETE POSTS BY USER ID
// ======================================================
app.post("/api/posts/delete-by-user", async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "user_id is required"
      });
    }

    // Delete related data first
    await db.query(`
      DELETE likes FROM likes
      JOIN posts ON likes.post_id = posts.id
      WHERE posts.user_id = ?
    `, [user_id]);

    await db.query(`
      DELETE comments FROM comments
      JOIN posts ON comments.post_id = posts.id
      WHERE posts.user_id = ?
    `, [user_id]);

    await db.query(`
      DELETE shares FROM shares
      JOIN posts ON shares.post_id = posts.id
      WHERE posts.user_id = ?
    `, [user_id]);

    // Delete posts
    const [result] = await db.query(
      "DELETE FROM posts WHERE user_id=?",
      [user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "No posts found for this user"
      });
    }

    res.json({
      success: true,
      message: `All posts deleted for user_id ${user_id}`
    });

  } catch (error) {
    console.error("DELETE POSTS BY USER ERROR 👉", error);
    res.status(500).json({
      success: false,
      message: error.sqlMessage || error.message
    });
  }
});


// ======================================================
// SAVE POST
// ======================================================
app.post("/api/posts/save", async (req, res) => {
  try {
    const { user_id, id } = req.body; 
    // id = posts.id (POST ID)

    if (!user_id || !id) {
      return res.status(400).json({
        success: false,
        message: "user_id and post id are required"
      });
    }

    // already saved check
    const [exists] = await db.query(
      "SELECT id FROM saved_posts WHERE user_id=? AND post_id=?",
      [user_id, id]
    );

    if (exists.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Post already saved"
      });
    }

    // save
    await db.query(
      "INSERT INTO saved_posts(user_id, post_id) VALUES (?,?)",
      [user_id, id]
    );

    res.status(201).json({
      success: true,
      message: "Post saved successfully"
    });

  } catch (error) {
    console.error("SAVE POST ERROR 👉", error);
    res.status(500).json({
      success: false,
      message: error.sqlMessage || error.message
    });
  }
});
// ======================================================

//like post

app.post("/api/posts/like", async (req, res) => {
  const { post_id, user_id } = req.body;

  // 🔎 check already liked
  const [rows] = await db.query(
    "SELECT id FROM likes WHERE post_id=? AND user_id=?",
    [post_id, user_id]
  );

  if (rows.length > 0) {
    return res.status(200).json({ message: "Already liked" });
  }

  await db.query(
    "INSERT INTO likes(post_id, user_id) VALUES(?,?)",
    [post_id, user_id]
  );

  res.json({ message: "Post liked" });
});

//
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

// ======================================================

//get like count

app.get("/api/posts/likes/:post_id", async (request, response) => {
    const post_id = request.params.post_id;

    const [rows] = await db.query(
        "SELECT COUNT(*) AS likes FROM likes WHERE post_id=?",
        [post_id]
    );

    response.json(rows[0]);
});


// ======================================================
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

// ======================================================
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




///follow user

app.post("/api/user/follow", async (req, res) => {
  const { follower_id, following_id } = req.body;

  await db.query(
    "INSERT INTO followers (follower_id, following_id) VALUES (?, ?)",
    [follower_id, following_id]
  );

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



// ======================================================
// START SERVER
// ======================================================
// app.listen(4003, () => {
//     console.log("Server is running on port 4003");
// });

app.listen(PORT,"0.0.0.0",()=>{
    console.log(`Server is running on port ${PORT}`);
})
module.exports = app;