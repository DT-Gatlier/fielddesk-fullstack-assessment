import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, message } from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import api from '../api';

const { Option } = Select;

interface WorkOrder {
  id: string;
  title: string;
  description: string;
  status: string;
  assigned_to: string | null;
  created_at: string;
}

const WorkOrders: React.FC = () => {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [editingOrder, setEditingOrder] = useState<WorkOrder | null>(null);
  const [form] = Form.useForm();
  
  const fetchWorkOrders = async () => {
    setLoading(true);
    try {
      const response = await api.get('/work-orders');
      setWorkOrders(response.data);
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Failed to load work orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkOrders();
  }, []);

  const handleCreate = () => {
    setEditingOrder(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: WorkOrder) => {
    setEditingOrder(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingOrder) {
        await api.patch(`/work-orders/${editingOrder.id}`, values);
        message.success('Work order updated');
      } else {
        await api.post('/work-orders', values);
        message.success('Work order created');
      }
      setModalVisible(false);
      fetchWorkOrders();
    } catch (error: any) {
      if (error.response?.data?.error) {
         message.error(error.response.data.error);
      } else if (error.errorFields) {
         // Form validation error
      } else {
         message.error('Operation failed');
      }
    }
  };

  const columns = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      filters: [
        { text: 'Open', value: 'open' },
        { text: 'In Progress', value: 'in_progress' },
        { text: 'Completed', value: 'completed' },
        { text: 'Cancelled', value: 'cancelled' },
      ],
      onFilter: (value: any, record: WorkOrder) => record.status === value,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: WorkOrder) => (
        <Button icon={<EditOutlined />} onClick={() => handleEdit(record)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2>Work Orders</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Create Work Order
        </Button>
      </div>
      
      <Table
        dataSource={workOrders}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: 'No work orders found' }}
      />

      <Modal
        title={editingOrder ? 'Edit Work Order' : 'Create Work Order'}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="Title"
            rules={[{ required: true, message: 'Please input the title!' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="description"
            label="Description"
          >
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item
            name="status"
            label="Status"
            initialValue="open"
          >
            <Select>
              <Option value="open">Open</Option>
              <Option value="in_progress">In Progress</Option>
              <Option value="completed">Completed</Option>
              <Option value="cancelled">Cancelled</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default WorkOrders;
