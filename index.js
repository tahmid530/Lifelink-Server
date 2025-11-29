const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.set("json spaces", 2);
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MySQL Database Connection
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Connected to MySQL Database');
        connection.release();
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
    }
}

testConnection();

// Health check endpoint
app.get('/', (req, res) => {
    res.send('Lifelink API is running!');
});

// Unified Users API - Handles both login and register activities
app.post('/users', async (req, res) => {
    try {
        const { 
            userId, 
            email, 
            loginMethod, 
            activityType, // 'login' or 'register'
            name, 
            phone, 
            timestamp, 
            userAgent, 
            platform 
        } = req.body;

        // Validate required fields
        if (!userId || !email || !loginMethod || !activityType) {
            return res.status(400).json({
                success: false,
                message: 'User ID, email, login method, and activity type are required'
            });
        }

        // For registration, name is required
        if (activityType === 'register' && !name) {
            return res.status(400).json({
                success: false,
                message: 'Name is required for registration'
            });
        }

        const query = `
            INSERT INTO users 
            (user_id, email, login_method, activity_type, name, phone, timestamp, user_agent, platform) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            userId,
            email,
            loginMethod,
            activityType,
            name || null, // Only for registration
            phone || null, // Only for registration
            timestamp || new Date().toISOString(),
            userAgent || null,
            platform || null
        ];

        const [result] = await pool.execute(query, values);

        res.status(201).json({
            success: true,
            message: activityType === 'register' 
                ? 'User registration recorded successfully!' 
                : 'Login activity recorded successfully!',
            data: {
                id: result.insertId,
                userId,
                email,
                activityType,
                ...(activityType === 'register' && { name })
            }
        });

    } catch (error) {
        console.error('Error storing user activity:', error);

        // Handle duplicate entry error
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                message: 'User activity already exists'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to record user activity',
            error: error.message
        });
    }
});

// Get all users (for admin purposes)
app.get('/users', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM users ORDER BY timestamp DESC');
        res.json({
            success: true,
            data: rows,
            count: rows.length
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users',
            error: error.message
        });
    }
});

// Get user by ID
app.get('/users/:id', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user',
            error: error.message
        });
    }
});

// Get user activities by user ID
app.get('/users/activities/:userId', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM users WHERE user_id = ? ORDER BY timestamp DESC', 
            [req.params.userId]
        );

        res.json({
            success: true,
            data: rows,
            count: rows.length
        });
    } catch (error) {
        console.error('Error fetching user activities:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user activities',
            error: error.message
        });
    }
});

// Update user (for profile updates)
app.put('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const allowedFields = ['name', 'phone', 'email'];
        const setClause = [];
        const values = [];

        allowedFields.forEach(field => {
            if (updates[field] !== undefined) {
                setClause.push(`${field} = ?`);
                values.push(updates[field]);
            }
        });

        if (setClause.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update'
            });
        }

        values.push(id);

        const query = `UPDATE users SET ${setClause.join(', ')} WHERE id = ?`;
        const [result] = await pool.execute(query, values);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'User updated successfully'
        });

    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user',
            error: error.message
        });
    }
});

// Delete user
app.delete('/users/:id', async (req, res) => {
    try {
        const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'User deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete user',
            error: error.message
        });
    }
});

// Get all donors
app.get('/donors', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM donors');
        res.send({
            success: true,
            data: rows,
            count: rows.length
        });
    } catch (error) {
        console.error('Error fetching donors:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch donors',
            error: error.message
        });
    }
});

// Get donor by ID
app.get('/donors/:id', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM donors WHERE id = ?', [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Donor not found'
            });
        }

        res.json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('Error fetching donor:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch donor',
            error: error.message
        });
    }
});

// Create new donor
app.post('/donors', async (req, res) => {
    try {
        const {
            fullName,
            email,
            phone,
            dateOfBirth,
            bloodType,
            weight,
            gender,
            lastDonation,
            hasDisease,
            diseaseDetails,
            isOnMedication,
            hadRecentSurgery,
            district,
            area,
            address,
            emergencyContact,
            terms
        } = req.body;

        // Validate required fields
        if (!fullName || !email || !phone || !dateOfBirth || !bloodType || !weight || !gender || !district || !area || !address || !emergencyContact) {
            return res.status(400).json({
                success: false,
                message: 'All required fields must be filled'
            });
        }

        const query = `
            INSERT INTO donors (
                full_name, email, phone, date_of_birth, blood_type, weight, gender,
                last_donation_date, has_disease, disease_details, is_on_medication,
                had_recent_surgery, district, area, address, emergency_contact, terms_accepted
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            fullName,
            email,
            phone,
            dateOfBirth,
            bloodType,
            parseFloat(weight),
            gender,
            lastDonation || null,
            Boolean(hasDisease),
            diseaseDetails || null,
            Boolean(isOnMedication),
            Boolean(hadRecentSurgery),
            district,
            area,
            address,
            emergencyContact,
            Boolean(terms)
        ];

        const [result] = await pool.execute(query, values);

        res.status(201).json({
            success: true,
            message: 'Donor registered successfully!',
            data: {
                id: result.insertId,
                fullName,
                email,
                bloodType
            }
        });

    } catch (error) {
        console.error('Error creating donor:', error);

        // Handle duplicate email error
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                message: 'Email already exists in our system'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to register donor',
            error: error.message
        });
    }
});

// Update donor
app.put('/donors/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const allowedFields = [
            'full_name', 'phone', 'weight', 'last_donation_date', 'has_disease',
            'disease_details', 'is_on_medication', 'had_recent_surgery', 'district',
            'area', 'address', 'emergency_contact'
        ];

        const setClause = [];
        const values = [];

        allowedFields.forEach(field => {
            if (updates[field] !== undefined) {
                setClause.push(`${field} = ?`);
                values.push(updates[field]);
            }
        });

        if (setClause.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update'
            });
        }

        values.push(id);

        const query = `UPDATE donors SET ${setClause.join(', ')} WHERE id = ?`;
        const [result] = await pool.execute(query, values);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Donor not found'
            });
        }

        res.json({
            success: true,
            message: 'Donor updated successfully'
        });

    } catch (error) {
        console.error('Error updating donor:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update donor',
            error: error.message
        });
    }
});

// Delete donor
app.delete('/donors/:id', async (req, res) => {
    try {
        const [result] = await pool.execute('DELETE FROM donors WHERE id = ?', [req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Donor not found'
            });
        }

        res.json({
            success: true,
            message: 'Donor deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting donor:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete donor',
            error: error.message
        });
    }
});

// Search donors by blood type and district
app.get('/donors/search', async (req, res) => {
    try {
        const { bloodType, district } = req.query;

        let query = 'SELECT * FROM donors WHERE 1=1';
        const values = [];

        if (bloodType) {
            query += ' AND blood_type = ?';
            values.push(bloodType);
        }

        if (district) {
            query += ' AND district = ?';
            values.push(district);
        }

        query += ' ORDER BY created_at DESC';

        const [rows] = await pool.execute(query, values);

        res.json({
            success: true,
            data: rows,
            count: rows.length
        });

    } catch (error) {
        console.error('Error searching donors:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search donors',
            error: error.message
        });
    }
});

// // Start server
// app.listen(PORT, () => {
//     console.log(`🚀 Server running on http://localhost:${PORT}`);
//     console.log(`📊 Database: ${dbConfig.database}`);
// });

// module.exports = app;


// Start server only in development
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`📊 Database: ${dbConfig.database}`);
    });
}

module.exports = app;