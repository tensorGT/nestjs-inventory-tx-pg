import { BadRequestException, Body, Controller, Get, Module, Post, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { IsInt, Min } from "class-validator";
import { Pool } from "pg";
import "reflect-metadata";

class PlaceOrderDto {
  @IsInt()
  @Min(1)
  productId!: number;

  @IsInt()
  @Min(1)
  qty!: number;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/inv_db",
});

@Controller("orders")
class OrdersController {
  @Post()
  async placeOrder(@Body() dto: PlaceOrderDto) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // lock product row so two requests dont sell same stock
      const prodRes = await client.query("SELECT * FROM products WHERE id = $1 FOR UPDATE", [dto.productId]);
      const prod = prodRes.rows[0];
      if (!prod) throw new BadRequestException("product not found");
      if (prod.stock < dto.qty) throw new BadRequestException("not enough stock left");

      await client.query("UPDATE products SET stock = stock - $1 WHERE id = $2", [dto.qty, dto.productId]);
      const totalCents = prod.price_cents * dto.qty;
      const orderRes = await client.query(
        "INSERT INTO orders (product_id, qty, total_cents) VALUES ($1, $2, $3) RETURNING *",
        [dto.productId, dto.qty, totalCents]
      );
      const order = orderRes.rows[0];
      await client.query(
        "INSERT INTO ledger_entries (order_id, delta_cents, note) VALUES ($1, $2, $3)",
        [order.id, totalCents, `order #${order.id} (${dto.qty}x ${prod.sku})`]
      );
      await client.query("COMMIT");
      return order;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  @Get("ledger")
  async getLedger() {
    const res = await pool.query("SELECT * FROM ledger_entries ORDER BY id DESC");
    return res.rows;
  }
}

@Module({ controllers: [OrdersController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT || 4011);
}
bootstrap();
