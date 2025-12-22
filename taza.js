const express = require("express");
const db = require("./db");
const app = express();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const e = require("express");
const path = require("path");
app.use(express.json());



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
app.post("/api/user/login", async (request, response) => {
    const email = request.body.email;
    const password = request.body.password;

    const secretKey = "ghdfjjgi9ew8865w";

    try {
        const [result] = await db.query(
            "SELECT id, name, email, password, role FROM users WHERE email=?",
            [email]
        );

        if (result.length === 0) {
            return response.status(401).json({ message: "Invalid email or password" });
        }

        const user = result[0];
        const isPasswordSame = await bcrypt.compare(password, user.password);

        if (isPasswordSame) {
            const token = jwt.sign(
                { id: user.id, name: user.name, email: user.email, role: user.role },
                secretKey,
                { expiresIn: "1h" }
            );

            return response.status(200).json({
                message: "Login successful",
                token: token
            });
        } else {
            return response.status(401).json({ message: "Invalid email or password" });
        }

    } catch (error) {
        return response.status(500).json({ message: "Internal server error" });
    }
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





//update user profile with picture upload

const storage = multer.diskStorage({
    destination:"./profileImages",
   filename:(request, file, cb)=>{
    cb(null, Date.now() + path.extname(file.originalname) );
   }
});

const upload = multer({storage: storage});  

app.use("/profileImages", express.static("profileImages")) // allowing to access picture through url

app.post("/api/user/update-profile", upload.single("profilePic"), async (req, res) => {
  const { id, name, email, bio } = req.body;

  if (!id) {
    return res.status(400).json({ message: "User id required" });
  }

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

  if (bio) {
    fields.push("bio=?");
    values.push(bio);
  }

  if (req.file) {
    const profilePicPath = `profileImages/${req.file.filename}`;
    fields.push("profilePic=?");
    values.push(profilePicPath);
  }

  if (fields.length === 0) {
    return res.status(400).json({ message: "Nothing to update" });
  }

  values.push(id);

  const sql = `UPDATE users SET ${fields.join(", ")} WHERE id=?`;

  db.query(sql, values, (error, result) => {
    if (error) {
      return res.status(500).json({ message: "Server internal error" });
    }

    res.status(200).json({
      message: "Profile updated successfully",
      profilePic: req.file ? `profileImages/${req.file.filename}` : undefined
    });
  });
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
