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



app.post("/api/like", async (req, res) => {
    const { user_id, post_id } = req.body;

    try {
        await db.query(
          "INSERT INTO likes(user_id, post_id) VALUES(?, ?)", 
          [user_id, post_id]
        );

        res.status(201).json({ message: "Post Liked" });

    } catch (err) {
        if (err.errno === 1062) {
            return res.status(409).json({ message: "Already Liked" });
        }
        res.status(500).json({ message: "Server Error" });
    }
});


app.post("/api/unlike", async (req, res) => {
    const { user_id, post_id } = req.body;

    try {
        await db.query(
          "DELETE FROM likes WHERE user_id=? AND post_id=?", 
          [user_id, post_id]
        );

        res.status(200).json({ message: "Like Removed" });

    } catch (err) {
        res.status(500).json({ message: "Server Error" });
    }
});


app.post("/api/comment", async (req, res) => {
    const { user_id, post_id, comment } = req.body;

    try {
        const [result] = await db.query(
          "INSERT INTO comments(user_id, post_id, comment) VALUES(?, ?, ?)",
          [user_id, post_id, comment]
        );

        res.status(201).json({
            id: result.insertId,
            comment: comment
        });

    } catch (err) {
        res.status(500).json({ message: "Server Error" });
    }
});


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




app.post("/api/follow", async (req, res) => {
    const { follower_id, following_id } = req.body;

    try {
        await db.query(
            "INSERT INTO follows(follower_id, following_id) VALUES(?, ?)",
            [follower_id, following_id]
        );

        res.status(201).json({ message: "User Followed" });

    } catch (err) {
        if (err.errno === 1062) {
            return res.status(409).json({ message: "Already Following" });
        }
        res.status(500).json({ message: "Server Error" });
    }
});


app.post("/api/unfollow", async (req, res) => {
    const { follower_id, following_id } = req.body;

    try {
        await db.query(
            "DELETE FROM follows WHERE follower_id=? AND following_id=?",
            [follower_id, following_id]
        );

        res.status(200).json({ message: "Unfollowed" });

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





// ======================================================
// START SERVER
// ======================================================
app.listen(4003, () => {
    console.log("Server is running on port 4003");
});
